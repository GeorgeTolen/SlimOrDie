package repositories

import (
	"fmt"
	"time"

	"errgo/internal/database"
	"errgo/internal/models"
)

type LeaderboardRepository struct {
	db *database.DB
}

func NewLeaderboardRepository(db *database.DB) *LeaderboardRepository {
	return &LeaderboardRepository{db: db}
}

func (r *LeaderboardRepository) Add(req *models.AddScoreRequest) (*models.LeaderboardEntry, error) {
	res, err := r.db.Exec(`
		INSERT INTO leaderboard (player_name, final_weight, weight_lost, days_survived, score, ending, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		req.PlayerName, req.FinalWeight, req.WeightLost, req.DaysSurvived, req.Score, req.Ending, time.Now(),
	)
	if err != nil {
		return nil, fmt.Errorf("insert leaderboard: %w", err)
	}
	id, _ := res.LastInsertId()

	var entry models.LeaderboardEntry
	err = r.db.QueryRow(`SELECT id, player_name, final_weight, weight_lost, days_survived, score, ending, created_at FROM leaderboard WHERE id=?`, id).Scan(
		&entry.ID, &entry.PlayerName, &entry.FinalWeight, &entry.WeightLost,
		&entry.DaysSurvived, &entry.Score, &entry.Ending, &entry.CreatedAt,
	)
	return &entry, err
}

func (r *LeaderboardRepository) GetTop(limit int) ([]*models.LeaderboardEntry, error) {
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	rows, err := r.db.Query(`
		SELECT id, player_name, final_weight, weight_lost, days_survived, score, ending, created_at
		FROM leaderboard ORDER BY score DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []*models.LeaderboardEntry
	for rows.Next() {
		var e models.LeaderboardEntry
		if err := rows.Scan(&e.ID, &e.PlayerName, &e.FinalWeight, &e.WeightLost, &e.DaysSurvived, &e.Score, &e.Ending, &e.CreatedAt); err != nil {
			return nil, err
		}
		entries = append(entries, &e)
	}
	return entries, rows.Err()
}
