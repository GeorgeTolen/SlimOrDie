package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"

	"errgo/internal/models"
	"errgo/internal/services"
)

type LeaderboardHandler struct {
	svc *services.LeaderboardService
}

func NewLeaderboardHandler(svc *services.LeaderboardService) *LeaderboardHandler {
	return &LeaderboardHandler{svc: svc}
}

func (h *LeaderboardHandler) Add(w http.ResponseWriter, r *http.Request) {
	var req models.AddScoreRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	entry, err := h.svc.Add(&req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, &models.APIResponse{Success: true, Data: entry})
}

func (h *LeaderboardHandler) GetTop(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 10
	if limitStr != "" {
		if n, err := strconv.Atoi(limitStr); err == nil && n > 0 {
			limit = n
		}
	}
	entries, err := h.svc.GetTop(limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if entries == nil {
		entries = []*models.LeaderboardEntry{}
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: entries})
}
