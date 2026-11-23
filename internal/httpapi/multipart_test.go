package httpapi

import (
	"bytes"
	"mime/multipart"
	"net/http/httptest"
	"testing"
)

func TestRequestFieldsKeepsSmallFileBytes(t *testing.T) {
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("pic", "avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := part.Write([]byte("not really a png, but bytes")); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest("POST", "/api/me/avatar", &body)
	request.Header.Set("Content-Type", writer.FormDataContentType())

	_, files, err := requestFields(request)
	if err != nil {
		t.Fatalf("requestFields: %v", err)
	}

	file := files["pic"]
	if file == nil {
		t.Fatal("pic was not parsed")
	}
	if len(file.data) == 0 {
		t.Fatal("the uploaded bytes were dropped")
	}
}
