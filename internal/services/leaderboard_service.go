package services

import (
	"errgo/internal/models"
	"errgo/internal/repositories"
)

type LeaderboardService struct {
	repo *repositories.LeaderboardRepository
}

func NewLeaderboardService(repo *repositories.LeaderboardRepository) *LeaderboardService {
	return &LeaderboardService{repo: repo}
}

func (s *LeaderboardService) Add(req *models.AddScoreRequest) (*models.LeaderboardEntry, error) {
	if req.PlayerName == "" {
		req.PlayerName = "Игрок"
	}
	// Calculate score: base on weight lost, days, ending bonus
	base := int(req.WeightLost * 100)
	dayBonus := (5 - req.DaysSurvived + 1) * 500
	var endBonus int
	switch req.Ending {
	case "secret":
		endBonus = 5000
	case "good":
		endBonus = 3000
	case "win":
		endBonus = 1000
	}
	req.Score = base + dayBonus + endBonus
	return s.repo.Add(req)
}

func (s *LeaderboardService) GetTop(limit int) ([]*models.LeaderboardEntry, error) {
	return s.repo.GetTop(limit)
}
