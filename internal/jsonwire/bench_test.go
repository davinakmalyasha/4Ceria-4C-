package jsonwire

import (
	"bytes"
	"encoding/json"
	"strconv"
	"strings"
	"testing"
)

// Representative wire shapes. The 50- and 500-row cases model the list
// endpoints (houses, directories, admin tables); the message case models the
// 277 small responses that dominate request count.

func benchObject(i int) *Object {
	return NewObject().
		Set("id", i).
		Set("name", "Rumah contoh nomor "+strconv.Itoa(i)).
		Set("price_idr", "Rp 1.250.000.000").
		Set("city", "Bandung").
		Set("bedrooms", 3).
		Set("bathrooms", 2).
		Set("verified", i%2 == 0).
		Set("description", "Rumah dua lantai dengan carport, taman kecil, dan akses jalan lebar. Dekat sekolah dan pusat perbelanjaan.").
		Set("tags", []any{"rumah", "bandung", "siap-huni"})
}

func benchList(n int) *Object {
	rows := make([]any, 0, n)
	for i := 0; i < n; i++ {
		rows = append(rows, benchObject(i))
	}
	return NewObject().
		Set("current_page", 1).
		Set("data", rows).
		Set("per_page", n).
		Set("total", n).
		Set("last_page", 1)
}

type benchRequest struct {
	Name        string   `json:"name"`
	Count       int      `json:"count"`
	Enabled     bool     `json:"enabled"`
	Description string   `json:"description"`
	Tags        []string `json:"tags"`
}

func benchMapBody() []byte {
	body := `{"name":"Ceria","count":42,"enabled":true,"description":"` +
		strings.Repeat("a", 900) + `","tags":["rumah","bandung","siap-huni"]}`
	return []byte(body)
}

func benchTypedBody() []byte {
	return []byte(`{"name":"Ceria","count":42,"enabled":true,"description":"` +
		strings.Repeat("a", 900) + `","tags":["rumah","bandung","siap-huni"]}`)
}

func benchLargeBody() []byte {
	return []byte(`{"name":"Ceria","count":42,"enabled":true,"description":"` +
		strings.Repeat("a", 2<<20) + `","tags":["rumah","bandung","siap-huni"]}`)
}

func BenchmarkDecodeMapSmallV1(b *testing.B) {
	body := benchMapBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := json.Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeMapSmallV2(b *testing.B) {
	body := benchMapBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeTypedSmallV1(b *testing.B) {
	body := benchTypedBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out benchRequest
		if err := json.Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeTypedSmallV2(b *testing.B) {
	body := benchTypedBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out benchRequest
		if err := Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeReaderSmallV1(b *testing.B) {
	body := benchMapBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := json.NewDecoder(bytes.NewReader(body)).Decode(&out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeReaderSmallV2(b *testing.B) {
	body := benchMapBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := UnmarshalRead(bytes.NewReader(body), &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeReaderLargeV1(b *testing.B) {
	body := benchLargeBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := json.NewDecoder(bytes.NewReader(body)).Decode(&out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeReaderLargeV2(b *testing.B) {
	body := benchLargeBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := UnmarshalRead(bytes.NewReader(body), &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeMapLargeV1(b *testing.B) {
	body := benchLargeBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := json.Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeMapLargeV2(b *testing.B) {
	body := benchLargeBody()
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var out map[string]any
		if err := Unmarshal(body, &out); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalMessage(b *testing.B) {
	body := NewObject().Set("message", "Profile updated successfully")
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Marshal(body); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalList50(b *testing.B) {
	body := benchList(50)
	b.SetBytes(int64(len(mustMarshal(b, body))))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Marshal(body); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalList500(b *testing.B) {
	body := benchList(500)
	b.SetBytes(int64(len(mustMarshal(b, body))))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Marshal(body); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalNested(b *testing.B) {
	body := NewObject().
		Set("project", NewObject().
			Set("id", 42).
			Set("title", "Renovation in Jakarta").
			Set("budget", 1200000000).
			Set("owner", NewObject().Set("id", 7).Set("name", "Malya"))).
		Set("termins", []any{
			NewObject().Set("label", "Mobilisation").Set("amount", 240000000).Set("status", "paid"),
			NewObject().Set("label", "Structure").Set("amount", 360000000).Set("status", "pending"),
		})
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Marshal(body); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkMarshalRaw(b *testing.B) {
	raw := Raw([]byte(`{"project_id":42,"dispute_id":9,"nested":{"a":1,"b":[true,false,null]}}`))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		if _, err := Marshal(raw); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkCompactJSON(b *testing.B) {
	document := []byte("{\n  \"project_id\": 42,\n  \"items\": [1, 2, 3],\n  \"note\": \"a b\"\n}")
	b.SetBytes(int64(len(document)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		CompactJSON(document)
	}
}

func BenchmarkDecodeRequestV1(b *testing.B) {
	body := []byte(`{"session_id":"11111111-1111-1111-1111-111111111111","message":"Cari rumah tiga kamar di Bandung di bawah 1,5 miliar","delivery_method":"Hire Platform Courier","services":[{"title":"Akta jual beli","price":"2500000"}]}`)
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var value any
		if err := json.Unmarshal(body, &value); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkDecodeRequestV2(b *testing.B) {
	body := []byte(`{"session_id":"11111111-1111-1111-1111-111111111111","message":"Cari rumah tiga kamar di Bandung di bawah 1,5 miliar","delivery_method":"Hire Platform Courier","services":[{"title":"Akta jual beli","price":"2500000"}]}`)
	b.SetBytes(int64(len(body)))
	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		var value any
		if err := Unmarshal(body, &value); err != nil {
			b.Fatal(err)
		}
	}
}

func mustMarshal(b *testing.B, value any) []byte {
	b.Helper()
	encoded, err := Marshal(value)
	if err != nil {
		b.Fatal(err)
	}
	return encoded
}
