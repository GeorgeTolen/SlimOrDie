package repositories

import (
	"fmt"
	"time"

	"errgo/internal/database"
	"errgo/internal/models"
)

type AchievementRepository struct {
	db *database.DB
}

func NewAchievementRepository(db *database.DB) *AchievementRepository {
	return &AchievementRepository{db: db}
}

func (r *AchievementRepository) Unlock(req *models.UnlockAchievementRequest) (*models.Achievement, error) {
	res, err := r.db.Exec(`
		INSERT OR IGNORE INTO achievements (save_id, name, description, icon, unlocked_at)
		VALUES (?, ?, ?, ?, ?)`,
		req.SaveID, req.Name, req.Description, req.Icon, time.Now(),
	)
	if err != nil {
		return nil, fmt.Errorf("unlock achievement: %w", err)
	}

	id, _ := res.LastInsertId()
	if id == 0 {
		return nil, nil // already unlocked
	}

	var a models.Achievement
	err = r.db.QueryRow(`SELECT id, save_id, name, description, icon, unlocked_at FROM achievements WHERE id=?`, id).Scan(
		&a.ID, &a.SaveID, &a.Name, &a.Description, &a.Icon, &a.UnlockedAt,
	)
	return &a, err
}

func (r *AchievementRepository) GetBySave(saveID int64) ([]*models.Achievement, error) {
	rows, err := r.db.Query(`SELECT id, save_id, name, description, icon, unlocked_at FROM achievements WHERE save_id=? ORDER BY unlocked_at ASC`, saveID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var achievements []*models.Achievement
	for rows.Next() {
		var a models.Achievement
		if err := rows.Scan(&a.ID, &a.SaveID, &a.Name, &a.Description, &a.Icon, &a.UnlockedAt); err != nil {
			return nil, err
		}
		achievements = append(achievements, &a)
	}
	return achievements, rows.Err()
}

func (r *AchievementRepository) GetAll() ([]*models.Achievement, error) {
	rows, err := r.db.Query(`SELECT id, save_id, name, description, icon, unlocked_at FROM achievements ORDER BY unlocked_at DESC LIMIT 100`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var achievements []*models.Achievement
	for rows.Next() {
		var a models.Achievement
		if err := rows.Scan(&a.ID, &a.SaveID, &a.Name, &a.Description, &a.Icon, &a.UnlockedAt); err != nil {
			return nil, err
		}
		achievements = append(achievements, &a)
	}
	return achievements, rows.Err()
}
