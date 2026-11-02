package httpapi

import ()

// BID RELATION KEY — which nested profile the wire bid carries.
//
// getBidderName touches exactly one relation (the bid's own role), and
// Eloquent serializes every loaded relation — so the confirm/sign
// responses carry that one nested block behind the legacy columns. The
// key follows getBidProfileRelationName, not the table name.

// bidRelationKey resolves the nested relation key, profile table and
// profile id for a bid's role.
func bidRelationKey(role string, bid map[string]any) (key, table string, profile int64, ok bool) {
	column, hasColumn := bidProfileColumn(role)
	table, hasTable := bidProfileTable(role)
	if !hasColumn || !hasTable {
		return "", "", 0, false
	}

	profile = profileID(bid, column)
	if profile == 0 {
		return "", "", 0, false
	}

	switch role {
	case "arsitek":
		key = "arsitek"
	case "kontraktor":
		key = "kontraktor"
	case "notaris":
		key = "notaris"
	case "interior":
		key = "interior"
	case "project_manager":
		key = "pm"
	case "structural":
		key = "structuralEngineer"
	case "mep":
		key = "mepEngineer"
	default:
		return "", "", 0, false
	}

	return key, table, profile, true
}
