<?php

namespace App\Http\Controllers;

use App\Models\Material;
use App\Models\MaterialImage;
use App\Models\Supplier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Cache;

class MaterialController extends Controller
{
    /** Auth-sensitive User attributes hidden on public payloads. */
    private const SENSITIVE_USER_FIELDS = ['email', 'email_verified_at', 'google_id', 'two_factor_secret', 'two_factor_recovery_codes', 'bank_name', 'bank_account_number', 'bank_account_name', 'unique_code'];
    /**
     * Display a listing of materials (Marketplace View).
     */
    public function index(Request $request)
    {
        $cacheKey = 'materials_list_' . md5(json_encode($request->all()));
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);

        $data = $supportsTags
            ? Cache::tags(['materials'])->remember($cacheKey, 600, function () use ($request) {
                return $this->getFilteredMaterials($request);
            })
            : Cache::remember($cacheKey, 600, function () use ($request) {
                return $this->getFilteredMaterials($request);
            });

        // SECURITY: this route is unauthenticated — hide supplier owner emails.
        $data->each(fn ($material) => $material->supplier?->user?->makeHidden(self::SENSITIVE_USER_FIELDS));

        return response()->json([
            'status' => 'success',
            'data' => $data,
        ]);
    }

    private function getFilteredMaterials(Request $request)
    {
        $query = Material::with(['supplier.user', 'images'])
            ->where('is_available', true)
            ->whereHas('supplier', function ($q) {
                $q->where('verification_status', 'verified');
            });

        if ($request->category) {
            $query->where('category', $request->category);
        }

        if ($request->search) {
            $query->where('name', 'like', '%'.$request->search.'%');
        }

        if ($request->min_price) {
            $query->where('price', '>=', $request->min_price);
        }

        if ($request->max_price) {
            $query->where('price', '<=', $request->max_price);
        }

        return $query->latest()->get();
    }

    /**
     * Display a listing of materials for the authenticated merchant/supplier.
     */
    public function merchantIndex(Request $request)
    {
        $user = Auth::user();
        $supplier = Supplier::where('user_id', $user->id)->firstOrFail();

        $query = Material::with('images')->where('supplier_id', $supplier->id);

        if ($request->search) {
            $query->where('name', 'like', '%'.$request->search.'%');
        }

        if ($request->category) {
            $query->where('category', $request->category);
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->latest()->get(),
        ]);
    }

    /**
     * Store a newly created material (Supplier Only).
     */
    public function store(Request $request)
    {
        $user = Auth::user();
        $supplier = Supplier::where('user_id', $user->id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'price' => 'required|numeric|min:0',
            'unit' => 'required|string|max:50',
            'category' => 'required|string|max:100',
            'stock' => 'integer|min:0',
            'images' => 'nullable|array',
            'images.*' => 'mimes:jpg,jpeg,png,webp|max:2048',
            'specifications' => 'nullable|array',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        $paths = [];
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                // PERF: stream originals now, queue the AVIF/WebP encode.
                $paths[] = $image->store('materials', 'public');
            }
        }

        $material = DB::transaction(function () use ($request, $supplier, $paths) {
            $data = $request->only(['name', 'description', 'price', 'unit', 'category', 'stock', 'specifications']);
            $data['supplier_id'] = $supplier->id;

            $material = Material::create($data);

            foreach ($paths as $path) {
                $imgRow = MaterialImage::create([
                    'material_id' => $material->id,
                    'image_path' => $path,
                ]);
                \App\Jobs\ConvertImageToWebpJob::dispatch($path, 'materials', MaterialImage::class, $imgRow->id, 'image_path', 'public');
            }

            return $material;
        });

        $this->clearCache();

        return response()->json([
            'status' => 'success',
            'message' => 'Material added successfully with multiple images',
            'data' => $material->load('images'),
        ]);
    }

    /**
     * Update the specified material (Supplier Only).
     */
    public function update(Request $request, $id)
    {
        $user = Auth::user();
        $supplier = Supplier::where('user_id', $user->id)->firstOrFail();
        $material = Material::where('id', $id)->where('supplier_id', $supplier->id)->firstOrFail();

        $validator = Validator::make($request->all(), [
            'name' => 'sometimes|required|string|max:255',
            'price' => 'sometimes|required|numeric|min:0',
            'stock' => 'sometimes|integer|min:0',
            'is_available' => 'sometimes|boolean',
            'images' => 'nullable|array',
            'images.*' => 'mimes:jpg,jpeg,png,webp|max:2048',
            'deleted_image_ids' => 'nullable|array',
            'deleted_image_ids.*' => 'exists:material_images,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        // Handle new uploads outside transaction
        $paths = [];
        if ($request->hasFile('images')) {
            foreach ($request->file('images') as $image) {
                $paths[] = \App\Services\ImageService::convertToWebp($image, 'materials');
            }
        }

        DB::transaction(function () use ($request, $material, $paths) {
            $updateData = $request->only(['name', 'description', 'price', 'unit', 'category', 'stock', 'is_available', 'specifications']);
            $material->update($updateData);

            // Handle deletions
            if ($request->deleted_image_ids) {
                foreach ($request->deleted_image_ids as $imageId) {
                    $img = MaterialImage::where('id', $imageId)->where('material_id', $material->id)->first();
                    if ($img) {
                        Storage::disk('public')->delete($img->image_path);
                        $img->delete();
                    }
                }
            }

            // Handle new uploads
            foreach ($paths as $path) {
                $imgRow = MaterialImage::create([
                    'material_id' => $material->id,
                    'image_path' => $path,
                ]);
                \App\Jobs\ConvertImageToWebpJob::dispatch($path, 'materials', MaterialImage::class, $imgRow->id, 'image_path', 'public');
            }
        });

        $this->clearCache();

        return response()->json([
            'status' => 'success',
            'message' => 'Material updated successfully',
            'data' => $material->load('images'),
        ]);
    }

    /**
     * Remove the specified material (Supplier Only).
     */
    public function destroy($id)
    {
        $user = Auth::user();
        $supplier = Supplier::where('user_id', $user->id)->firstOrFail();
        $material = Material::with('images')->where('id', $id)->where('supplier_id', $supplier->id)->firstOrFail();

        return DB::transaction(function () use ($material) {
            foreach ($material->images as $img) {
                Storage::disk('public')->delete($img->image_path);
            }
            // cascadeOnDelete in migration handles the DB side for images
            $material->delete();

            $this->clearCache();

            return response()->json([
                'status' => 'success',
                'message' => 'Material and its images deleted successfully',
            ]);
        });
    }

    private function clearCache()
    {
        $supportsTags = in_array(config('cache.default'), ['redis', 'memcached']);
        if ($supportsTags) {
            Cache::tags(['materials'])->flush();
        } else {
            Cache::flush();
        }
    }
}
