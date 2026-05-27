use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;
use crate::core::state::errors::Result;
use tauri::AppHandle;

#[derive(Clone)]
pub struct DbPool {
    pub pool: SqlitePool,
}

impl DbPool {
    pub async fn init(app: &AppHandle) -> Result<Self> {
        let app_data_dir = crate::core::fs_utils::get_app_data_dir(app)
            .map_err(|e| crate::core::state::errors::StateError::DatabaseError(e))?;
            
        let db_path = app_data_dir.join("chiro_pet.db");
        let db_url = format!("sqlite://{}?mode=rwc", db_path.to_string_lossy());

        // Create the pool
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(&db_url)
            .await
            .map_err(|e| crate::core::state::errors::StateError::DatabaseError(e.to_string()))?;

        // Initialize schema
        Self::run_migrations(&pool).await?;

        Ok(Self { pool })
    }

    async fn run_migrations(pool: &SqlitePool) -> Result<()> {
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS character_states (
                character_id TEXT PRIMARY KEY,
                mood INTEGER NOT NULL,
                energy INTEGER NOT NULL,
                affinity INTEGER NOT NULL,
                trust INTEGER NOT NULL,
                familiarity INTEGER NOT NULL,
                curiosity INTEGER NOT NULL,
                patience INTEGER NOT NULL,
                confidence INTEGER NOT NULL,
                updated_at DATETIME NOT NULL,
                schema_version INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS daily_counters (
                character_id TEXT NOT NULL,
                date_str TEXT NOT NULL,
                affinity_gained_today INTEGER NOT NULL,
                proactive_count_today INTEGER NOT NULL,
                ai_calls_today INTEGER NOT NULL,
                ai_cost_cents_today INTEGER NOT NULL,
                interaction_count_today INTEGER NOT NULL,
                PRIMARY KEY (character_id, date_str)
            );
            "#
        )
        .execute(pool)
        .await
        .map_err(|e| crate::core::state::errors::StateError::DatabaseError(e.to_string()))?;

        Ok(())
    }
}
