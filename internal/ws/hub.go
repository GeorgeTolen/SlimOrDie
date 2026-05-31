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

type Room struct {
	mu       sync.Mutex
	Day      int
	Phase    string // "lobby" | "playing" | "night"
	Votes    map[string]string
	Ready    map[string]bool
	Players  map[string]*PlayerState
	colorIdx int

	// Cooperative activity tracking: activity -> set of playerIDs that finished
	ActivityDone map[string]map[string]bool
}

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
		ID: ps.ID, Name: ps.Name, Weight: ps.Weight, Energy: ps.Energy,
		Mood: ps.Mood, Score: ps.Score, Day: ps.Day, Color: ps.Color,
		X: ps.X, Y: ps.Y, State: ps.State, Facing: ps.Facing, Ready: ps.Ready,
	}
}

func NewHub() *Hub {
	return &Hub{
		clients:    make(map[string]*Client),
		register:   make(chan *Client, 32),
		unregister: make(chan *Client, 32),
		incoming:   make(chan clientMsg, 256),
		room: &Room{
			Day:          1,
			Phase:        "lobby",
			Votes:        make(map[string]string),
			Ready:        make(map[string]bool),
			Players:      make(map[string]*PlayerState),
			ActivityDone: make(map[string]map[string]bool),
		},
	}
}

func (h *Hub) Register(c *Client) { h.register <- c }

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
		ID: c.ID, Name: c.Name, Weight: 110, Energy: 100, Mood: 100,
		Color: color, Day: h.room.Day,
		X: 200 + float64(len(h.room.Players))*90, Y: 380,
		State: "idle", Facing: true,
	}
	h.room.Players[c.ID] = ps
	h.room.mu.Unlock()

	h.sendTo(c, MsgWelcome, WelcomePayload{
		PlayerID: c.ID, Players: h.allPlayers(),
		GameDay: h.room.Day, Phase: h.room.Phase,
		ReadyCount: h.readyCount(), Total: h.totalCount(),
	})
	h.broadcast(MsgPlayerJoin, ps.toInfo(), c.ID)
	h.broadcastLobby()
	log.Printf("ws: joined %s (%s)", c.ID, c.Name)
}

func (h *Hub) onLeave(c *Client) {
	h.mu.Lock()
	delete(h.clients, c.ID)
	h.mu.Unlock()

	h.room.mu.Lock()
	delete(h.room.Players, c.ID)
	delete(h.room.Votes, c.ID)
	delete(h.room.Ready, c.ID)
	// Remove from all activity completion sets
	for act := range h.room.ActivityDone {
		delete(h.room.ActivityDone[act], c.ID)
	}
	h.room.mu.Unlock()

	h.broadcast(MsgPlayerLeave, map[string]string{"player_id": c.ID}, "")

	// Re-check all in-progress activities — maybe everyone is done now
	h.checkAllActivities()
	h.broadcastLobby()
	log.Printf("ws: left %s", c.ID)
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
			ps.X = x; ps.Y = y; ps.State = state; ps.Facing = facing
			if weight > 0 {
				ps.Weight = weight
			}
		}
		h.room.mu.Unlock()
		h.broadcastExcept(MsgPlayerMove, MovePayload{
			PlayerID: c.ID, X: x, Y: y, State: state, Facing: facing, Weight: weight,
		}, c.ID)

	case "activity_start":
		activity, _ := msg.Payload["activity"].(string)
		h.room.mu.Lock()
		ps := h.room.Players[c.ID]
		var name, color string
		if ps != nil {
			name = ps.Name
			color = ps.Color
		}
		h.room.mu.Unlock()
		// Broadcast who started so others see the notification
		h.broadcast(MsgActivityStart, ActivityStartPayload{
			PlayerID: c.ID, PlayerName: name, Activity: activity, Color: color,
		}, "")

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
		// Mark this player as done for this activity
		if h.room.ActivityDone[activity] == nil {
			h.room.ActivityDone[activity] = make(map[string]bool)
		}
		h.room.ActivityDone[activity][c.ID] = true
		h.room.mu.Unlock()

		// Broadcast individual result
		h.broadcast(MsgActivityResult, ActivityResultPayload{
			PlayerID: c.ID, PlayerName: name, Activity: activity,
			Success: success, WeightLost: wl, NewWeight: newW, Color: color,
		}, "")

		// Broadcast waiting status for this activity
		h.broadcastWaitingStatus(activity)

		// Check if everyone is done
		h.checkActivity(activity)

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

	case "vote":
		choice, _ := msg.Payload["choice"].(string)
		h.room.mu.Lock()
		h.room.Votes[c.ID] = choice
		tally := h.tallyVotes()
		votes := copyMap(h.room.Votes)
		h.room.mu.Unlock()
		h.broadcast(MsgVoteUpdate, VoteUpdatePayload{Votes: votes, Tally: tally}, "")

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
		// Lobby ГОТОВ — all clients start day 1 locally when all_ready fires.
		// Hub does NOT increment day here; each client manages their own day cycle.
		h.room.mu.Lock()
		h.room.Ready[c.ID] = true
		rc := h.readyCountLocked()
		total := len(h.room.Players)
		allReady := rc >= total && total > 0
		if allReady {
			h.room.Ready = make(map[string]bool) // reset for next use
		}
		h.room.mu.Unlock()
		h.broadcast(MsgReadyStatus, ReadyStatusPayload{
			ReadyCount: rc, Total: total, AllReady: allReady,
		}, "")

	case "night_ready":
		// End-of-night ГОТОВ — all clients advance to next day when all_ready fires.
		h.room.mu.Lock()
		h.room.Ready[c.ID] = true
		rc := h.readyCountLocked()
		total := len(h.room.Players)
		allReady := rc >= total && total > 0
		if allReady {
			h.room.Ready = make(map[string]bool)
			h.room.Day++
			h.room.ActivityDone = make(map[string]map[string]bool)
		}
		day := h.room.Day
		h.room.mu.Unlock()
		h.broadcast(MsgReadyStatus, ReadyStatusPayload{
			ReadyCount: rc, Total: total, AllReady: allReady,
		}, "")
		if allReady {
			h.broadcast(MsgDayStart, map[string]int{"day": day}, "")
		}
	}
}

// checkActivity checks if all connected players finished a specific activity.
func (h *Hub) checkActivity(activity string) {
	h.room.mu.Lock()
	done := h.room.ActivityDone[activity]
	total := len(h.room.Players)
	doneCount := len(done)
	allDone := total > 0 && doneCount >= total
	if allDone {
		// Reset for next time
		h.room.ActivityDone[activity] = make(map[string]bool)
	}
	h.room.mu.Unlock()

	if allDone {
		bonus := 0.5
		h.broadcast(MsgActivityAllDone, ActivityAllDonePayload{
			Activity: activity, GroupBonus: bonus,
		}, "")
		log.Printf("ws: all players done with %s, bonus %.1f", activity, bonus)
	}
}

// checkAllActivities is called when a player disconnects.
func (h *Hub) checkAllActivities() {
	h.room.mu.Lock()
	activities := make([]string, 0, len(h.room.ActivityDone))
	for act, done := range h.room.ActivityDone {
		if len(done) > 0 {
			activities = append(activities, act)
		}
	}
	h.room.mu.Unlock()

	for _, act := range activities {
		h.broadcastWaitingStatus(act)
		h.checkActivity(act)
	}
}

func (h *Hub) broadcastWaitingStatus(activity string) {
	h.room.mu.Lock()
	done := make(map[string]bool)
	names := make(map[string]string)
	colors := make(map[string]string)
	for id, ps := range h.room.Players {
		names[id] = ps.Name
		colors[id] = ps.Color
		if h.room.ActivityDone[activity] != nil {
			done[id] = h.room.ActivityDone[activity][id]
		}
	}
	total := len(h.room.Players)
	doneCount := len(h.room.ActivityDone[activity])
	allDone := total > 0 && doneCount >= total
	h.room.mu.Unlock()

	h.broadcast(MsgWaitingStatus, WaitingStatusPayload{
		Activity: activity, Done: done, Names: names, Colors: colors,
		DoneCount: doneCount, Total: total, AllDone: allDone,
	}, "")
}

func (h *Hub) advanceDay() {
	h.room.mu.Lock()
	h.room.Day++
	h.room.Phase = "playing"
	h.room.Ready = make(map[string]bool)
	h.room.Votes = make(map[string]string)
	h.room.ActivityDone = make(map[string]map[string]bool)
	day := h.room.Day
	h.room.mu.Unlock()
	h.broadcast(MsgDayStart, map[string]int{"day": day}, "")
	h.broadcastLobby()
}

// ── helpers ─────────────────────────────────────────────────────────────────

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
		Votes:      copyMap(h.room.Votes),
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

func copyMap(v map[string]string) map[string]string {
	out := make(map[string]string, len(v))
	for k, val := range v {
		out[k] = val
	}
	return out
}
