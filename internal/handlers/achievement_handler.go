package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"errgo/internal/models"
	"errgo/internal/services"
)

type AchievementHandler struct {
	svc *services.AchievementService
}

func NewAchievementHandler(svc *services.AchievementService) *AchievementHandler {
	return &AchievementHandler{svc: svc}
}

func (h *AchievementHandler) Unlock(w http.ResponseWriter, r *http.Request) {
	var req models.UnlockAchievementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	ach, err := h.svc.Unlock(&req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if ach == nil {
		writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: nil})
		return
	}
	writeJSON(w, http.StatusCreated, &models.APIResponse{Success: true, Data: ach})
}

func (h *AchievementHandler) GetBySave(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/achievements/")
	saveID, err := strconv.ParseInt(strings.TrimSuffix(path, "/"), 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid save id")
		return
	}
	achs, err := h.svc.GetBySave(saveID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if achs == nil {
		achs = []*models.Achievement{}
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: achs})
}

func (h *AchievementHandler) GetAll(w http.ResponseWriter, r *http.Request) {
	achs, err := h.svc.GetAll()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if achs == nil {
		achs = []*models.Achievement{}
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: achs})
}
