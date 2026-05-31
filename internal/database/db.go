package database

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
)

type DB struct {
	*sql.DB
}

func New(dbPath string) (*DB, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	db, err := sql.Open("sqlite3", dbPath+"?_journal=WAL&_timeout=5000&_fk=true")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("ping db: %w", err)
	}

	d := &DB{db}
	if err := d.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

func (d *DB) migrate() error {
	schema := `
CREATE TABLE IF NOT EXISTS game_saves (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name TEXT    NOT NULL,
    day         INTEGER NOT NULL DEFAULT 1,
    weight      REAL    NOT NULL DEFAULT 110.0,
    energy      REAL    NOT NULL DEFAULT 100.0,
    mood        REAL    NOT NULL DEFAULT 100.0,
    strength    INTEGER NOT NULL DEFAULT 1,
    speed       INTEGER NOT NULL DEFAULT 1,
    experience  INTEGER NOT NULL DEFAULT 0,
    score       INTEGER NOT NULL DEFAULT 0,
    state_json  TEXT    NOT NULL DEFAULT '{}',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS leaderboard (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    player_name   TEXT    NOT NULL,
    final_weight  REAL    NOT NULL,
    weight_lost   REAL    NOT NULL,
    days_survived INTEGER NOT NULL,
    score         INTEGER NOT NULL,
    ending        TEXT    NOT NULL DEFAULT 'death',
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS achievements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    save_id     INTEGER NOT NULL,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    icon        TEXT    NOT NULL DEFAULT '',
    unlocked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (save_id) REFERENCES game_saves(id) ON DELETE CASCADE,
    UNIQUE(save_id, name)
);

CREATE INDEX IF NOT EXISTS idx_leaderboard_score ON leaderboard(score DESC);
CREATE INDEX IF NOT EXISTS idx_achievements_save ON achievements(save_id);
`
	_, err := d.Exec(schema)
	return err
}
