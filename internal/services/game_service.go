package services

import (
	"errgo/internal/models"
	"errgo/internal/repositories"
)

type GameService struct {
	repo *repositories.GameRepository
}

func NewGameService(repo *repositories.GameRepository) *GameService {
	return &GameService{repo: repo}
}

func (s *GameService) Save(req *models.SaveGameRequest) (*models.GameSave, error) {
	if req.PlayerName == "" {
		req.PlayerName = "Игрок"
	}
	return s.repo.Save(req)
}

func (s *GameService) Update(id int64, req *models.SaveGameRequest) (*models.GameSave, error) {
	if req.PlayerName == "" {
		req.PlayerName = "Игрок"
	}
	return s.repo.Update(id, req)
}

func (s *GameService) Load(id int64) (*models.GameSave, error) {
	return s.repo.GetByID(id)
}

func (s *GameService) List() ([]*models.GameSave, error) {
	return s.repo.List()
}

func (s *GameService) Delete(id int64) error {
	return s.repo.Delete(id)
}
