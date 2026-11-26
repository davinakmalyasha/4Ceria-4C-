package httpapi

import (
	"reflect"
	"testing"
)

// directorySearchColumns must track tables whose text columns differ.
// kontraktors has no `lokasi` (schema 0003: its address column is
// `alamat`); the generic four-column search 500s there.
func TestDirectorySearchColumns(t *testing.T) {
	if got := directorySearchColumns("kontraktors"); !reflect.DeepEqual(got, []string{"nama", "company_name", "spesialisasi", "alamat"}) {
		t.Fatalf("kontraktors search columns = %q", got)
	}

	for _, table := range []string{
		"arsiteks", "notaris_profiles", "interior_profiles",
		"structural_engineers", "mep_engineers", "project_managers",
	} {
		got := directorySearchColumns(table)
		want := []string{"nama", "company_name", "spesialisasi", "lokasi"}
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s search columns = %q, want %q", table, got, want)
		}
	}

	// Unknown tables keep the generic shape (directoryColumns falls
	// back to `*`, and the search must not be narrower than that).
	if got := directorySearchColumns("no_such_table"); !reflect.DeepEqual(got, []string{"nama", "company_name", "spesialisasi", "lokasi"}) {
		t.Fatalf("default search columns = %q", got)
	}
}
