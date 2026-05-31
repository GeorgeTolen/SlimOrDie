package services

import (
	"errgo/internal/models"
	"errgo/internal/repositories"
)

type AchievementService struct {
	repo *repositories.AchievementRepository
}

func NewAchievementService(repo *repositories.AchievementRepository) *AchievementService {
	return &AchievementService{repo: repo}
}

func (s *AchievementService) Unlock(req *models.UnlockAchievementRequest) (*models.Achievement, error) {
	return s.repo.Unlock(req)
}

func (s *AchievementService) GetBySave(saveID int64) ([]*models.Achievement, error) {
	return s.repo.GetBySave(saveID)
}

func (s *AchievementService) GetAll() ([]*models.Achievement, error) {
	return s.repo.GetAll()
}
