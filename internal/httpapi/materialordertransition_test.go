package httpapi

import "testing"

// TestSupplierOrderTransitions pins the supplier-side state machine for
// material orders: every edge is an explicit fulfilment-ordered step. The
// previous gate (`isSupplier && newStatus != "paid"`) authorized ANY supplier
// transition, so a supplier could walk pending -> delivered with no payment,
// no proof and no escrow movement via direct API calls.
func TestSupplierOrderTransitions(t *testing.T) {
	allowed := [][2]string{
		{"pending", "processing"},
		{"pending", "cancelled"},
		{"awaiting_payment", "processing"},
		{"awaiting_payment", "cancelled"},
		{"processing", "ready_for_pickup"},
		{"processing", "shipping"},
		{"processing", "cancelled"},
		{"ready_for_pickup", "shipping"},
		{"ready_for_pickup", "delivered"},
		{"shipping", "delivered"},
		{"paid", "processing"},
		{"paid", "shipping"},
	}
	for _, edge := range allowed {
		if !supplierOrderTransitionAllowed(edge[0], edge[1]) {
			t.Errorf("expected supplier transition %s -> %s to be allowed", edge[0], edge[1])
		}
	}

	denied := [][2]string{
		// The money hole: fulfilment without payment.
		{"pending", "delivered"},
		{"pending", "shipping"},
		{"pending", "paid"},
		{"pending", "ready_for_pickup"},
		{"awaiting_payment", "delivered"},
		{"awaiting_payment", "shipping"},
		{"awaiting_payment", "paid"},
		{"processing", "delivered"},
		{"processing", "paid"},
		// Backward edges never exist.
		{"processing", "pending"},
		{"shipping", "processing"},
		{"shipping", "pending"},
		{"delivered", "shipping"},
		{"delivered", "processing"},
		{"delivered", "cancelled"},
		{"cancelled", "processing"},
		{"completed", "shipping"},
		// Unknown states stay closed.
		{"pending", "refunded"},
		{"bogus", "processing"},
		{"pending", "bogus"},
	}
	for _, edge := range denied {
		if supplierOrderTransitionAllowed(edge[0], edge[1]) {
			t.Errorf("expected supplier transition %s -> %s to be denied", edge[0], edge[1])
		}
	}
}
