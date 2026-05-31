package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"errgo/internal/models"
	"errgo/internal/services"
)

type GameHandler struct {
	svc *services.GameService
}

func NewGameHandler(svc *services.GameService) *GameHandler {
	return &GameHandler{svc: svc}
}

func (h *GameHandler) Save(w http.ResponseWriter, r *http.Request) {
	var req models.SaveGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	save, err := h.svc.Save(&req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, &models.APIResponse{Success: true, Data: save})
}

func (h *GameHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, err := extractID(r.URL.Path, "/api/game/save/")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var req models.SaveGameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	save, err := h.svc.Update(id, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: save})
}

func (h *GameHandler) Load(w http.ResponseWriter, r *http.Request) {
	id, err := extractID(r.URL.Path, "/api/game/load/")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	save, err := h.svc.Load(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if save == nil {
		writeError(w, http.StatusNotFound, "save not found")
		return
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: save})
}

func (h *GameHandler) List(w http.ResponseWriter, r *http.Request) {
	saves, err := h.svc.List()
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	if saves == nil {
		saves = []*models.GameSave{}
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true, Data: saves})
}

func (h *GameHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, err := extractID(r.URL.Path, "/api/game/save/")
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.Delete(id); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, &models.APIResponse{Success: true})
}

func extractID(path, prefix string) (int64, error) {
	trimmed := strings.TrimPrefix(path, prefix)
	trimmed = strings.TrimSuffix(trimmed, "/")
	return strconv.ParseInt(trimmed, 10, 64)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, &models.APIResponse{Success: false, Error: msg})
}
