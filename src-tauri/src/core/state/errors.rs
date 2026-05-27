use thiserror::Error;

#[derive(Debug, Error)]
pub enum StateError {
    #[error("Character not found: {0}")]
    CharacterNotFound(String),

    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("Migration failed: {0}")]
    MigrationFailed(String),

    #[error("Guard rejected mutation: {0}")]
    GuardRejected(String),

    #[error("State corruption detected: {0}")]
    Corruption(String),

    #[error("Import validation failed: {0}")]
    ImportInvalid(String),
}

pub type Result<T> = std::result::Result<T, StateError>;
