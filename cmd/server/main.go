package main

import (
	"log"
	"net/http"
	"os"
	"strings"

	"errgo/internal/database"
	"errgo/internal/handlers"
	"errgo/internal/repositories"
	"errgo/internal/services"
	"errgo/internal/ws"
)

func main() {
	dbPath := os.Getenv("DB_PATH")
	if dbPath == "" {
		dbPath = "./data/game.db"
	}

	db, err := database.New(dbPath)
	if err != nil {
		log.Fatalf("database init: %v", err)
	}
	defer db.Close()

	gameRepo := repositories.NewGameRepository(db)
	lbRepo := repositories.NewLeaderboardRepository(db)
	achRepo := repositories.NewAchievementRepository(db)

	gameSvc := services.NewGameService(gameRepo)
	lbSvc := services.NewLeaderboardService(lbRepo)
	achSvc := services.NewAchievementService(achRepo)

	gameH := handlers.NewGameHandler(gameSvc)
	lbH := handlers.NewLeaderboardHandler(lbSvc)
	achH := handlers.NewAchievementHandler(achSvc)

	// WebSocket hub
	hub := ws.NewHub()
	go hub.Run()
	wsH := handlers.NewWSHandler(hub)

	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"ok"}`))
	})

	// WebSocket endpoint
	mux.Handle("/ws", wsH)

	mux.HandleFunc("/api/game/saves", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			gameH.List(w, r)
		case http.MethodPost:
			gameH.Save(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/game/save/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/game/save/") && r.URL.Path != "/api/game/save/" {
			switch r.Method {
			case http.MethodPut:
				gameH.Update(w, r)
			case http.MethodDelete:
				gameH.Delete(w, r)
			default:
				http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			}
			return
		}
		http.NotFound(w, r)
	})

	mux.HandleFunc("/api/game/load/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			gameH.Load(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/leaderboard", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			lbH.GetTop(w, r)
		case http.MethodPost:
			lbH.Add(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	mux.HandleFunc("/api/achievements", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet {
			achH.GetAll(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/achievements/unlock", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			achH.Unlock(w, r)
			return
		}
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	})

	mux.HandleFunc("/api/achievements/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && r.URL.Path != "/api/achievements/" {
			achH.GetBySave(w, r)
			return
		}
		http.NotFound(w, r)
	})

	fs := http.FileServer(http.Dir("./web"))
	mux.Handle("/", corsMiddleware(fs))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("🎮 ПОХУДЕЙ ИЛИ УМРИ — сервер запущен на http://localhost:%s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
