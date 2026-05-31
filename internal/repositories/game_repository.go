package repositories

import (
	"database/sql"
	"fmt"
	"time"

	"errgo/internal/database"
	"errgo/internal/models"
)

type GameRepository struct {
	db *database.DB
}

func NewGameRepository(db *database.DB) *GameRepository {
	return &GameRepository{db: db}
}

func (r *GameRepository) Save(req *models.SaveGameRequest) (*models.GameSave, error) {
	now := time.Now()
	res, err := r.db.Exec(`
		INSERT INTO game_saves (player_name, day, weight, energy, mood, strength, speed, experience, score, state_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		req.PlayerName, req.Day, req.Weight, req.Energy, req.Mood,
		req.Strength, req.Speed, req.Experience, req.Score, req.StateJSON, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert save: %w", err)
	}
	id, _ := res.LastInsertId()
	return r.GetByID(id)
}

func (r *GameRepository) Update(id int64, req *models.SaveGameRequest) (*models.GameSave, error) {
	_, err := r.db.Exec(`
		UPDATE game_saves
		SET player_name=?, day=?, weight=?, energy=?, mood=?, strength=?, speed=?, experience=?, score=?, state_json=?, updated_at=?
		WHERE id=?`,
		req.PlayerName, req.Day, req.Weight, req.Energy, req.Mood,
		req.Strength, req.Speed, req.Experience, req.Score, req.StateJSON, time.Now(), id,
	)
	if err != nil {
		return nil, fmt.Errorf("update save: %w", err)
	}
	return r.GetByID(id)
}

func (r *GameRepository) GetByID(id int64) (*models.GameSave, error) {
	row := r.db.QueryRow(`SELECT id, player_name, day, weight, energy, mood, strength, speed, experience, score, state_json, created_at, updated_at FROM game_saves WHERE id=?`, id)
	return scanSave(row)
}

func (r *GameRepository) List() ([]*models.GameSave, error) {
	rows, err := r.db.Query(`SELECT id, player_name, day, weight, energy, mood, strength, speed, experience, score, state_json, created_at, updated_at FROM game_saves ORDER BY updated_at DESC LIMIT 10`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var saves []*models.GameSave
	for rows.Next() {
		s, err := scanSave(rows)
		if err != nil {
			return nil, err
		}
		saves = append(saves, s)
	}
	return saves, rows.Err()
}

func (r *GameRepository) Delete(id int64) error {
	_, err := r.db.Exec(`DELETE FROM game_saves WHERE id=?`, id)
	return err
}

type scanner interface {
	Scan(dest ...any) error
}

func scanSave(s scanner) (*models.GameSave, error) {
	var gs models.GameSave
	err := s.Scan(
		&gs.ID, &gs.PlayerName, &gs.Day, &gs.Weight, &gs.Energy, &gs.Mood,
		&gs.Strength, &gs.Speed, &gs.Experience, &gs.Score, &gs.StateJSON,
		&gs.CreatedAt, &gs.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &gs, err
}
