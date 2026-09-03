use neuron_api::{
    app_state, build_router,
    config::{load_dotenv, Config},
    connect,
    db::games::sync_games,
    jobs, MIGRATOR,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Vor dem Einlesen der Konfiguration, damit eine .env-Datei greift.
    let dotenv_path = load_dotenv();
    // Ein Konfigurationsfehler ist ein Bedienfehler, kein Absturz: die Meldung
    // erklärt sich selbst, ein Backtrace wäre nur Rauschen.
    let config = match Config::from_env() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    };

    let filter = EnvFilter::try_new(&config.rust_log).unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter);
    if std::env::var("NEURON_LOG_FORMAT").as_deref() == Ok("json") {
        registry
            .with(tracing_subscriber::fmt::layer().json())
            .init();
    } else {
        registry.with(tracing_subscriber::fmt::layer()).init();
    }

    if let Some(path) = dotenv_path {
        tracing::info!(path = %path.display(), "Konfiguration aus .env ergänzt");
    }
    if config.cookie_secure {
        tracing::info!(
            "Refresh-Cookie mit Secure-Flag: die App muss über HTTPS erreichbar sein, \
             sonst verwirft der Browser das Cookie und die Anmeldung hält nicht."
        );
    } else {
        tracing::warn!(
            "COOKIE_SECURE=false: das Refresh-Cookie wird auch unverschlüsselt gesendet. \
             Nur für lokale Entwicklung oder ein privates Netz vertretbar."
        );
    }

    let pool = connect(&config.database_url).await?;
    if config.run_migrations {
        MIGRATOR.run(&pool).await?;
        tracing::info!("migrations applied");
    }
    sync_games(&pool).await?;
    jobs::rotate_rounds::rotate_once(&pool).await?;
    jobs::rotate_rounds::spawn(pool.clone());

    let bind = config.bind_addr.clone();
    let state = app_state(pool, config);
    let app = build_router(state);

    let listener = tokio::net::TcpListener::bind(&bind).await?;
    tracing::info!(addr = %bind, "neuron-api listening");
    axum::serve(listener, app).await?;
    Ok(())
}
