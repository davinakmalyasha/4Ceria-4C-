package httpapi

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"strconv"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// SIGNED STORAGE — presigned GETs without leaking private bytes.
//
// When S3_* is configured the bucket is the store and GETs are presigned
// there (15 min). Without it (local default) the gateway serves the same
// bytes from the local disk behind the auth gate with an HMAC expiry query
// (`?expires=&sig=`), so a copied URL stops working. Either way no private
// path is ever world-readable and no unsigned URL is ever emitted.

func s3Configured() bool {
	return os.Getenv("S3_ENDPOINT") != "" && os.Getenv("S3_BUCKET") != "" &&
		os.Getenv("S3_ACCESS_KEY") != "" && os.Getenv("S3_SECRET_KEY") != ""
}

func storageHMACKey() []byte {
	if k := os.Getenv("APP_KEY"); k != "" {
		return []byte(k)
	}
	return []byte("4ceria-dev-storage-key")
}

// signStorageURL signs a relative storage path with an expiry unix timestamp.
func signStorageURL(rel string, expires int64) string {
	mac := hmac.New(sha256.New, storageHMACKey())
	mac.Write([]byte(rel + "|" + strconv.FormatInt(expires, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

// verifyStorageURL checks the HMAC and expiry.
func verifyStorageURL(rel string, expires int64, sig string) bool {
	if time.Now().Unix() > expires {
		return false
	}
	want := signStorageURL(rel, expires)
	return hmac.Equal([]byte(want), []byte(sig))
}

// presignedLocalURL builds the gateway-signed path for a private relative file.
func presignedLocalURL(rel string, ttl time.Duration) string {
	exp := time.Now().Add(ttl).Unix()
	return "/storage/" + rel + "?expires=" + strconv.FormatInt(exp, 10) + "&sig=" + signStorageURL(rel, exp)
}

// presignedS3Get returns a presigned GET URL for a bucket key (15 min).
// ok=false when S3 is not configured or signing fails — callers fall back
// to local serve, never to an unsigned URL.
func presignedS3Get(ctx context.Context, key string, ttl time.Duration) (string, bool) {
	if !s3Configured() {
		return "", false
	}
	endpoint := os.Getenv("S3_ENDPOINT")
	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("S3_REGION")
	if region == "" {
		region = "auto"
	}
	client := s3.NewFromConfig(aws.Config{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), ""),
		BaseEndpoint: &endpoint,
	})
	presigner := s3.NewPresignClient(client)
	out, err := presigner.PresignGetObject(ctx, &s3.GetObjectInput{
		Bucket: &bucket,
		Key:    &key,
	}, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", false
	}
	return out.URL, true
}

// presignedS3Put returns a presigned PUT URL for a bucket key (15 min) so
// browsers upload directly (no 4.5 MB body cap through the gateway).
func presignedS3Put(ctx context.Context, key, contentType string, ttl time.Duration) (string, bool) {
	if !s3Configured() {
		return "", false
	}
	endpoint := os.Getenv("S3_ENDPOINT")
	bucket := os.Getenv("S3_BUCKET")
	region := os.Getenv("S3_REGION")
	if region == "" {
		region = "auto"
	}
	client := s3.NewFromConfig(aws.Config{
		Region:      region,
		Credentials: credentials.NewStaticCredentialsProvider(os.Getenv("S3_ACCESS_KEY"), os.Getenv("S3_SECRET_KEY"), ""),
		BaseEndpoint: &endpoint,
	})
	presigner := s3.NewPresignClient(client)
	in := &s3.PutObjectInput{Bucket: &bucket, Key: &key}
	if contentType != "" {
		in.ContentType = &contentType
	}
	out, err := presigner.PresignPutObject(ctx, in, s3.WithPresignExpires(ttl))
	if err != nil {
		return "", false
	}
	return out.URL, true
}
