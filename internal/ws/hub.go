package ws

import (
	"encoding/json"
	"log"
	"sync"
)

var playerColors = []string{
	"#ff4444", "#44aaff", "#44ff44", "#ffff00",
	"#ff44ff", "#ff8800", "#00ffff", "#ff8888",
}

// Hub maintains all WebSocket clients and the shared room state.
type Hub struct {
	mu         sync.RWMutex
	clients    map[string]*Client
	register   chan *Client
	unregister chan *Client
	incoming   chan clientMsg
	room       *Room
}

type clientMsg struct {
	client *Client
	data   []byte
}

// Room is the single shared game room.
type Room struct {
	mu      sync.Mutex
	Day     int
	Phase   string // "lobby" | "playing" | "night"
	Votes   map[string]string
	Ready   map[string]bool
	Players map[string]*PlayerState
	colorIdx int
}

// PlayerState is the server-side representation of a connected player.
type PlayerState struct {
	ID     string
	Name   string
	Weight float64
	Energy float64
	Mood   float64
	Score  int
	Day    int
	Color  string
	X      float64
	Y      float64
	State  string
	Facing bool
	Ready  bool
}

func (ps *PlayerState) toInfo() PlayerInfo {
	return PlayerInfo{
		ID:     ps.ID,
		Name:   ps.Name,
		Weight: ps.Weight,
		Energy: ps.Energy,
		Mood:   ps.Mood,
		Score:  ps.Score,
		Day:    ps.Day,
		Color:  ps.Color,
		X:      ps.X,
		Y:      ps.Y,
		State:  ps.State,
		Facing: ps.Facing,
		Ready:  ps.Ready,
	}
}

// Register enqueues a new client for the hub's Run loop.
func (h *Hub) Register(c *Client) {
	h.register <- c
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
		incoming:   make(chan clientMsg, 256),
		room: &Room{
			Day:     1,
			Phase:   "lobby",
			Votes:   make(map[string]string),
			Ready:   make(map[string]bool),
			Players: make(map[string]*PlayerState),
		},
	}
}

func (h *Hub) Run() {
	for {
		select {
		case c := <-h.register:
			h.onJoin(c)
		case c := <-h.unregister:
			h.onLeave(c)
		case cm := <-h.incoming:
			h.onMessage(cm.client, cm.data)
		}
	}
}

func (h *Hub) onJoin(c *Client) {
	h.mu.Lock()
	h.clients[c.ID] = c
	h.mu.Unlock()

	h.room.mu.Lock()
	color := playerColors[h.room.colorIdx%len(playerColors)]
	h.room.colorIdx++
	ps := &PlayerState{
		ID:     c.ID,
		Name:   c.Name,
		Weight: 110,
		Energy: 100,
		Mood:   100,
		Color:  color,
		Day:    h.room.Day,
		X:      300 + float64(len(h.room.Players))*80,
		Y:      380,
		State:  "idle",
		Facing: true,
	}
	h.room.Players[c.ID] = ps
	h.room.mu.Unlock()

	// Send welcome to new client
	h.sendTo(c, MsgWelcome, WelcomePayload{
		PlayerID:   c.ID,
		Players:    h.allPlayers(),
		GameDay:    h.room.Day,
		Phase:      h.room.Phase,
		ReadyCount: h.readyCount(),
		Total:      h.totalCount(),
	})

	// Notify others
	h.broadcast(MsgPlayerJoin, ps.toInfo(), c.ID)
	h.broadcastLobby()

	log.Printf("ws: player joined %s (%s)", c.ID, c.Name)
}

func (h *Hub) onLeave(c *Client) {
	h.mu.Lock()
	delete(h.clients, c.ID)
	h.mu.Unlock()

	h.room.mu.Lock()
	delete(h.room.Players, c.ID)
	delete(h.room.Votes, c.ID)
	delete(h.room.Ready, c.ID)
	h.room.mu.Unlock()

	h.broadcast(MsgPlayerLeave, map[string]string{"player_id": c.ID}, "")
	h.broadcastLobby()
	log.Printf("ws: player left %s", c.ID)
}

func (h *Hub) onMessage(c *Client, data []byte) {
	var msg IncomingMsg
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "join":
		name, _ := msg.Payload["name"].(string)
		if name == "" {
			name = "Игрок"
		}
		if len(name) > 20 {
			name = name[:20]
		}
		c.Name = name
		h.room.mu.Lock()
		if ps, ok := h.room.Players[c.ID]; ok {
			ps.Name = name
		}
		h.room.mu.Unlock()
		h.broadcastLobby()

	case "move":
		p := msg.Payload
		x, _ := p["x"].(float64)
		y, _ := p["y"].(float64)
		state, _ := p["state"].(string)
		facing, _ := p["facing"].(bool)
		weight, _ := p["weight"].(float64)

		h.room.mu.Lock()
		if ps, ok := h.room.Players[c.ID]; ok {
			ps.X = x
			ps.Y = y
			ps.State = state
			ps.Facing = facing
			if weight > 0 {
				ps.Weight = weight
			}
		}
		h.room.mu.Unlock()

		h.broadcastExcept(MsgPlayerMove, MovePayload{
			PlayerID: c.ID, X: x, Y: y, State: state, Facing: facing, Weight: weight,
		}, c.ID)

	case "vote":
		choice, _ := msg.Payload["choice"].(string)
		h.room.mu.Lock()
		h.room.Votes[c.ID] = choice
		tally := h.tallyVotes()
		votes := copyVotes(h.room.Votes)
		h.room.mu.Unlock()

		h.broadcast(MsgVoteUpdate, VoteUpdatePayload{Votes: votes, Tally: tally}, "")

	case "activity_result":
		p := msg.Payload
		activity, _ := p["activity"].(string)
		success, _ := p["success"].(bool)
		wl, _ := p["weight_lost"].(float64)
		newW, _ := p["new_weight"].(float64)

		h.room.mu.Lock()
		ps := h.room.Players[c.ID]
		var name, color string
		if ps != nil {
			ps.Weight = newW
			name = ps.Name
			color = ps.Color
		}
		h.room.mu.Unlock()

		h.broadcast(MsgActivityResult, ActivityResultPayload{
			PlayerID: c.ID, PlayerName: name, Activity: activity,
			Success: success, WeightLost: wl, NewWeight: newW, Color: color,
		}, "")

		h.checkGroupBonus(activity)

	case "stats_update":
		p := msg.Payload
		weight, _ := p["weight"].(float64)
		energy, _ := p["energy"].(float64)
		mood, _ := p["mood"].(float64)
		score, _ := p["score"].(float64)
		day, _ := p["day"].(float64)

		h.room.mu.Lock()
		if ps, ok := h.room.Players[c.ID]; ok {
			if weight > 0 {
				ps.Weight = weight
			}
			ps.Energy = energy
			ps.Mood = mood
			ps.Score = int(score)
			if day > 0 {
				ps.Day = int(day)
			}
		}
		h.room.mu.Unlock()

		h.broadcastExcept(MsgStatsUpdate, StatsPayload{
			PlayerID: c.ID, Weight: weight, Energy: energy,
			Mood: mood, Score: int(score), Day: int(day),
		}, c.ID)

	case "chat":
		text, _ := msg.Payload["text"].(string)
		if len(text) > 120 {
			text = text[:120]
		}
		h.room.mu.Lock()
		ps := h.room.Players[c.ID]
		var name, color string
		if ps != nil {
			name = ps.Name
			color = ps.Color
		}
		h.room.mu.Unlock()

		h.broadcast(MsgChat, ChatPayload{
			PlayerID: c.ID, PlayerName: name, Text: text, Color: color,
		}, "")

	case "ready":
		h.room.mu.Lock()
		h.room.Ready[c.ID] = true
		rc := h.readyCountLocked()
		total := len(h.room.Players)
		allReady := rc >= total && total > 0
		h.room.mu.Unlock()

		h.broadcast(MsgReadyStatus, ReadyStatusPayload{
			ReadyCount: rc, Total: total, AllReady: allReady,
		}, "")

		if allReady {
			h.advanceDay()
		}

	case "night_done":
		// Same as ready
		h.room.mu.Lock()
		h.room.Ready[c.ID] = true
		rc := h.readyCountLocked()
		total := len(h.room.Players)
		allReady := rc >= total && total > 0
		h.room.mu.Unlock()
		if allReady {
			h.advanceDay()
		}
	}
}

func (h *Hub) advanceDay() {
	h.room.mu.Lock()
	h.room.Day++
	h.room.Phase = "playing"
	h.room.Ready = make(map[string]bool)
	h.room.Votes = make(map[string]string)
	day := h.room.Day
	h.room.mu.Unlock()

	h.broadcast(MsgDayStart, map[string]int{"day": day}, "")
	h.broadcastLobby()
}

func (h *Hub) checkGroupBonus(activity string) {
	h.mu.RLock()
	total := len(h.clients)
	h.mu.RUnlock()
	if total < 2 {
		return
	}

	h.room.mu.Lock()
	doneCount := 0
	for _, ps := range h.room.Players {
		if ps.Weight < 110 {
			doneCount++
		}
	}
	h.room.mu.Unlock()

	if doneCount >= total && total >= 2 {
		h.broadcast(MsgGroupBonus, GroupBonusPayload{
			Reason:     "Все игроки завершили " + activity + "! Групповой бонус!",
			WeightDrop: 0.5,
		}, "")
	}
}

// --- helpers ---

func (h *Hub) sendTo(c *Client, t MsgType, payload interface{}) {
	data, _ := json.Marshal(Envelope{Type: t, Payload: payload})
	select {
	case c.send <- data:
	default:
	}
}

func (h *Hub) broadcast(t MsgType, payload interface{}, excludeID string) {
	data, _ := json.Marshal(Envelope{Type: t, Payload: payload})
	h.mu.RLock()
	defer h.mu.RUnlock()
	for id, c := range h.clients {
		if id == excludeID {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *Hub) broadcastExcept(t MsgType, payload interface{}, excludeID string) {
	h.broadcast(t, payload, excludeID)
}

func (h *Hub) broadcastLobby() {
	h.broadcast(MsgLobbyUpdate, LobbyUpdatePayload{
		Players:    h.allPlayers(),
		GameDay:    h.room.Day,
		Phase:      h.room.Phase,
		Votes:      copyVotes(h.room.Votes),
		ReadyCount: h.readyCount(),
		Total:      h.totalCount(),
	}, "")
}

func (h *Hub) allPlayers() []PlayerInfo {
	h.room.mu.Lock()
	defer h.room.mu.Unlock()
	out := make([]PlayerInfo, 0, len(h.room.Players))
	for _, ps := range h.room.Players {
		out = append(out, ps.toInfo())
	}
	return out
}

func (h *Hub) readyCount() int {
	h.room.mu.Lock()
	defer h.room.mu.Unlock()
	return h.readyCountLocked()
}

func (h *Hub) readyCountLocked() int {
	n := 0
	for _, v := range h.room.Ready {
		if v {
			n++
		}
	}
	return n
}

func (h *Hub) totalCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

func (h *Hub) tallyVotes() map[string]int {
	t := make(map[string]int)
	for _, v := range h.room.Votes {
		t[v]++
	}
	return t
}

func copyVotes(v map[string]string) map[string]string {
	out := make(map[string]string, len(v))
	for k, val := range v {
		out[k] = val
	}
	return out
}
