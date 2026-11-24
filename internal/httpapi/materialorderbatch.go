package httpapi

import (
	"context"
	"strings"

	"github.com/davinakmalyasha/4ceria/internal/jsonwire"
	"github.com/jackc/pgx/v5/pgxpool"
)

// MATERIAL ORDER LIST BATCHING
//
// GET /api/material-orders has no pagination and used to build every relation
// with one or two queries per row. This bundle answers the whole page with a
// fixed eight queries: supplier, user, project, items, item materials, review,
// delivery job and delivery-job logistics.

type materialOrderBundle struct {
	suppliers map[int64]*jsonwire.Object
	users     map[int64]any
	projects  map[int64]*jsonwire.Object
	items     map[int64][]any
	reviews   map[int64]any
	jobs      map[int64]any
}

type materialOrderItemRow struct {
	id, orderID, materialID int64
	quantity                int64
	price                   string
	createdAt, updatedAt    any
	requirementID           *int64
}

func buildMaterialOrderBundle(ctx context.Context, pool *pgxpool.Pool, orders []map[string]any) (*materialOrderBundle, error) {
	bundle := &materialOrderBundle{
		suppliers: map[int64]*jsonwire.Object{},
		users:     map[int64]any{},
		projects:  map[int64]*jsonwire.Object{},
		items:     map[int64][]any{},
		reviews:   map[int64]any{},
		jobs:      map[int64]any{},
	}
	if len(orders) == 0 {
		return bundle, nil
	}

	orderIDs := make([]int64, 0, len(orders))
	userSet := map[int64]bool{}
	supplierSet := map[int64]bool{}
	projectSet := map[int64]bool{}
	userIDs := make([]int64, 0, len(orders))
	supplierIDs := make([]int64, 0, len(orders))
	projectIDs := make([]int64, 0, len(orders))

	for _, order := range orders {
		if id := intPtrDeref(order["id"]); id != 0 {
			orderIDs = append(orderIDs, id)
		}
		if id := intPtrDeref(order["user_id"]); id != 0 && !userSet[id] {
			userSet[id] = true
			userIDs = append(userIDs, id)
		}
		if id := intPtrDeref(order["supplier_id"]); id != 0 && !supplierSet[id] {
			supplierSet[id] = true
			supplierIDs = append(supplierIDs, id)
		}
		if id := intPtrDeref(order["project_id"]); id != 0 && !projectSet[id] {
			projectSet[id] = true
			projectIDs = append(projectIDs, id)
		}
	}

	if len(supplierIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(supplierModelColumns, ", ")+
			` FROM suppliers WHERE id = ANY($1)`, supplierIDs)
		if err != nil {
			return nil, err
		}
		fields := fieldNames(rows)
		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				return nil, err
			}
			bundle.suppliers[projectInt(values, fields, "id")] = supplierModelFromValues(fields, values)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	users, err := fullProfileUsersBatch(ctx, pool, userIDs, false, true)
	if err != nil {
		return nil, err
	}
	bundle.users = users

	if len(projectIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT `+strings.Join(projectModelColumns, ", ")+
			` FROM projects WHERE id = ANY($1)`, projectIDs)
		if err != nil {
			return nil, err
		}
		fields := fieldNames(rows)
		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				return nil, err
			}
			bundle.projects[projectInt(values, fields, "id")] = rawProjectModelFromValues(fields, values)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	itemRows := make([]materialOrderItemRow, 0)
	materialSet := map[int64]bool{}
	materialIDs := make([]int64, 0)
	if len(orderIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT id, order_id, material_id, quantity,
			price_at_order::text, created_at, updated_at, requirement_id
			FROM material_order_items WHERE order_id = ANY($1)
			ORDER BY order_id, id`, orderIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var row materialOrderItemRow
			if err := rows.Scan(&row.id, &row.orderID, &row.materialID, &row.quantity,
				&row.price, &row.createdAt, &row.updatedAt, &row.requirementID); err != nil {
				rows.Close()
				return nil, err
			}
			itemRows = append(itemRows, row)
			if row.materialID != 0 && !materialSet[row.materialID] {
				materialSet[row.materialID] = true
				materialIDs = append(materialIDs, row.materialID)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	materials := map[int64]*jsonwire.Object{}
	if len(materialIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT id, supplier_id, name, description, price::text,
			unit, category, stock, is_available, image_path, specifications::text,
			created_at, updated_at
			FROM materials WHERE id = ANY($1)`, materialIDs)
		if err != nil {
			return nil, err
		}
		fields := fieldNames(rows)
		for rows.Next() {
			values, err := scanRow(rows, len(fields))
			if err != nil {
				rows.Close()
				return nil, err
			}
			materials[projectInt(values, fields, "id")] = materialModelFromValues(fields, values)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	for _, row := range itemRows {
		item := jsonwire.NewObject()
		item.Set("id", row.id)
		item.Set("order_id", row.orderID)
		item.Set("material_id", row.materialID)
		item.Set("quantity", row.quantity)
		item.Set("price_at_order", row.price)
		item.Set("created_at", projectTimeValue(row.createdAt))
		item.Set("updated_at", projectTimeValue(row.updatedAt))
		item.Set("requirement_id", nullableInt64(row.requirementID))
		item.Set("material", materials[row.materialID])
		bundle.items[row.orderID] = append(bundle.items[row.orderID], item)
	}

	if len(orderIDs) > 0 {
		rows, err := pool.Query(ctx, `SELECT id, user_id, supplier_id, order_id, rating,
			comment, image_path, created_at, updated_at, delivery_rating, delivery_comment,
			delivery_user_id, image_paths::text, delivery_image_paths::text
			FROM material_order_reviews WHERE order_id = ANY($1)`, orderIDs)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			var row materialOrderReviewRow
			if err := rows.Scan(&row.id, &row.userID, &row.supplierID, &row.order, &row.rating,
				&row.comment, &row.imagePath, &row.createdAt, &row.updatedAt,
				&row.deliveryRating, &row.deliveryComment, &row.deliveryUserID,
				&row.imagePaths, &row.deliveryPaths); err != nil {
				rows.Close()
				return nil, err
			}
			bundle.reviews[row.order] = materialOrderReviewFromRow(row)
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()
	}

	if len(orderIDs) > 0 {
		rows, err := pool.Query(ctx, `
			SELECT wanted.order_id,
			       j.id, j.quote_id, j.order_id, j.logistics_id, j.pickup_address,
			       j.dropoff_address, j.status, j.agreed_fee::text,
			       j.estimated_weight::text, j.created_at, j.updated_at,
			       j.pickup_photos::text, j.delivery_photos::text
			  FROM unnest($1::bigint[]) AS wanted(order_id)
			  LEFT JOIN LATERAL (
			      SELECT * FROM delivery_jobs j
			       WHERE j.order_id = wanted.order_id
			          OR j.quote_id IN (
			              SELECT quote_id FROM delivery_jobs WHERE order_id = wanted.order_id
			          )
			       LIMIT 1
			  ) j ON true`, orderIDs)
		if err != nil {
			return nil, err
		}
		type jobRow struct {
			wantedOrderID int64
			row           materialOrderDeliveryJobRow
		}
		jobRows := make([]jobRow, 0)
		logisticsSet := map[int64]bool{}
		logisticsIDs := make([]int64, 0)
		for rows.Next() {
			var wantedOrderID int64
			var id, order, logisticsID *int64
			var quoteID *int64
			var pickup, dropoff, jobStatus, agreedFee, estimatedWeight *string
			var createdAt, updatedAt any
			var pickupPhotos, deliveryPhotos *string
			if err := rows.Scan(&wantedOrderID, &id, &quoteID, &order, &logisticsID,
				&pickup, &dropoff, &jobStatus, &agreedFee, &estimatedWeight,
				&createdAt, &updatedAt, &pickupPhotos, &deliveryPhotos); err != nil {
				rows.Close()
				return nil, err
			}
			if id == nil || order == nil {
				continue
			}
			jobRows = append(jobRows, jobRow{
				wantedOrderID: wantedOrderID,
				row: materialOrderDeliveryJobRow{
					id: *id, order: *order, quoteID: quoteID, logisticsID: logisticsID,
					pickup: pickup, dropoff: dropoff, jobStatus: jobStatus,
					agreedFee: agreedFee, estimatedWeight: estimatedWeight,
					createdAt: createdAt, updatedAt: updatedAt,
					pickupPhotos: pickupPhotos, deliveryPhotos: deliveryPhotos,
				},
			})
			if logisticsID != nil && *logisticsID != 0 && !logisticsSet[*logisticsID] {
				logisticsSet[*logisticsID] = true
				logisticsIDs = append(logisticsIDs, *logisticsID)
			}
		}
		if err := rows.Err(); err != nil {
			rows.Close()
			return nil, err
		}
		rows.Close()

		logistics, err := fullProfileUsersBatch(ctx, pool, logisticsIDs, true, true)
		if err != nil {
			return nil, err
		}
		for _, job := range jobRows {
			entry := materialOrderDeliveryJobFromRow(job.row)
			if job.row.logisticsID != nil && *job.row.logisticsID != 0 {
				entry.Set("logistics", logistics[*job.row.logisticsID])
			} else {
				entry.Set("logistics", nil)
			}
			bundle.jobs[job.wantedOrderID] = entry
		}
	}

	return bundle, nil
}

// relations mirrors materialOrderRelations from the prefetched maps.
func (b *materialOrderBundle) relations(entry *jsonwire.Object, byName map[string]any, relations []string) {
	for _, relation := range relations {
		switch relation {
		case "supplier":
			entry.Set("supplier", b.suppliers[intPtrDeref(byName["supplier_id"])])
		case "user":
			entry.Set("user", b.users[intPtrDeref(byName["user_id"])])
		case "project":
			entry.Set("project", b.projects[intPtrDeref(byName["project_id"])])
		case "items":
			items := b.items[intPtrDeref(byName["id"])]
			if items == nil {
				items = []any{}
			}
			entry.Set("items", items)
		case "review":
			entry.Set("review", b.reviews[intPtrDeref(byName["id"])])
		case "deliveryJob":
			entry.Set("delivery_job", b.jobs[intPtrDeref(byName["id"])])
		}
	}
}
