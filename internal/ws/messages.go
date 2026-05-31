package ws

// MsgType identifies the kind of WebSocket message.
type MsgType string

const (
	MsgWelcome        MsgType = "welcome"
	MsgLobbyUpdate    MsgType = "lobby_update"
	MsgPlayerJoin     MsgType = "player_join"
	MsgPlayerLeave    MsgType = "player_leave"
	MsgPlayerMove     MsgType = "player_move"
	MsgActivityVote   MsgType = "activity_vote"
	MsgVoteUpdate     MsgType = "vote_update"
	MsgActivityResult MsgType = "activity_result"
	MsgStatsUpdate    MsgType = "stats_update"
	MsgChat           MsgType = "chat"
	MsgNightStart     MsgType = "night_start"
	MsgDayStart       MsgType = "day_start"
	MsgReadyUp        MsgType = "ready_up"
	MsgReadyStatus    MsgType = "ready_status"
	MsgGroupBonus     MsgType = "group_bonus"
	MsgError          MsgType = "error"
)

type Envelope struct {
	Type    MsgType     `json:"type"`
	Payload interface{} `json:"payload"`
}

// PlayerInfo is the serialised state sent to all clients.
type PlayerInfo struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	Weight float64 `json:"weight"`
	Energy float64 `json:"energy"`
	Mood   float64 `json:"mood"`
	Score  int     `json:"score"`
	Day    int     `json:"day"`
	Color  string  `json:"color"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	State  string  `json:"state"`
	Facing bool    `json:"facing"`
	Ready  bool    `json:"ready"`
}

type WelcomePayload struct {
	PlayerID   string       `json:"player_id"`
	Players    []PlayerInfo `json:"players"`
	GameDay    int          `json:"game_day"`
	Phase      string       `json:"phase"`
	ReadyCount int          `json:"ready_count"`
	Total      int          `json:"total"`
}

type LobbyUpdatePayload struct {
	Players    []PlayerInfo      `json:"players"`
	GameDay    int               `json:"game_day"`
	Phase      string            `json:"phase"`
	Votes      map[string]string `json:"votes"`
	ReadyCount int               `json:"ready_count"`
	Total      int               `json:"total"`
}

type MovePayload struct {
	PlayerID string  `json:"player_id"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	State    string  `json:"state"`
	Facing   bool    `json:"facing"`
	Weight   float64 `json:"weight"`
}

type ActivityResultPayload struct {
	PlayerID   string  `json:"player_id"`
	PlayerName string  `json:"player_name"`
	Activity   string  `json:"activity"`
	Success    bool    `json:"success"`
	WeightLost float64 `json:"weight_lost"`
	NewWeight  float64 `json:"new_weight"`
	Color      string  `json:"color"`
}

type GroupBonusPayload struct {
	Reason     string  `json:"reason"`
	WeightDrop float64 `json:"weight_drop"`
}

type ChatPayload struct {
	PlayerID   string `json:"player_id"`
	PlayerName string `json:"player_name"`
	Text       string `json:"text"`
	Color      string `json:"color"`
}

type StatsPayload struct {
	PlayerID string  `json:"player_id"`
	Weight   float64 `json:"weight"`
	Energy   float64 `json:"energy"`
	Mood     float64 `json:"mood"`
	Score    int     `json:"score"`
	Day      int     `json:"day"`
}

type VoteUpdatePayload struct {
	Votes map[string]string `json:"votes"`
	Tally map[string]int    `json:"tally"`
}

type NightPayload struct {
	Events  []string `json:"events"`
	NextDay int      `json:"next_day"`
}

type ReadyStatusPayload struct {
	ReadyCount int  `json:"ready_count"`
	Total      int  `json:"total"`
	AllReady   bool `json:"all_ready"`
}

// Incoming from client
type IncomingMsg struct {
	Type    string                 `json:"type"`
	Payload map[string]interface{} `json:"payload"`
}
