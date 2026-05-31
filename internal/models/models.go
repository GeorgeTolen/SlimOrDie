package models

import "time"

type GameSave struct {
	ID         int64     `json:"id"`
	PlayerName string    `json:"player_name"`
	Day        int       `json:"day"`
	Weight     float64   `json:"weight"`
	Energy     float64   `json:"energy"`
	Mood       float64   `json:"mood"`
	Strength   int       `json:"strength"`
	Speed      int       `json:"speed"`
	Experience int       `json:"experience"`
	Score      int       `json:"score"`
	StateJSON  string    `json:"state_json"`
	CreatedAt  time.Time `json:"created_at"`
	UpdatedAt  time.Time `json:"updated_at"`
}

type LeaderboardEntry struct {
	ID           int64     `json:"id"`
	PlayerName   string    `json:"player_name"`
	FinalWeight  float64   `json:"final_weight"`
	WeightLost   float64   `json:"weight_lost"`
	DaysSurvived int       `json:"days_survived"`
	Score        int       `json:"score"`
	Ending       string    `json:"ending"`
	CreatedAt    time.Time `json:"created_at"`
}

type Achievement struct {
	ID          int64     `json:"id"`
	SaveID      int64     `json:"save_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Icon        string    `json:"icon"`
	UnlockedAt  time.Time `json:"unlocked_at"`
}

type SaveGameRequest struct {
	PlayerName string  `json:"player_name"`
	Day        int     `json:"day"`
	Weight     float64 `json:"weight"`
	Energy     float64 `json:"energy"`
	Mood       float64 `json:"mood"`
	Strength   int     `json:"strength"`
	Speed      int     `json:"speed"`
	Experience int     `json:"experience"`
	Score      int     `json:"score"`
	StateJSON  string  `json:"state_json"`
}

type AddScoreRequest struct {
	PlayerName   string  `json:"player_name"`
	FinalWeight  float64 `json:"final_weight"`
	WeightLost   float64 `json:"weight_lost"`
	DaysSurvived int     `json:"days_survived"`
	Score        int     `json:"score"`
	Ending       string  `json:"ending"`
}

type UnlockAchievementRequest struct {
	SaveID      int64  `json:"save_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Icon        string `json:"icon"`
}

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}
