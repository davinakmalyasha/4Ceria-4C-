<?php

namespace App\Http\Controllers;

use App\Models\Material;
use App\Models\Supplier;
use App\Models\MaterialImage;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\DB;

class MaterialController extends Controller
{
    /**
     * Display a listing of materials (Marketplace View).
     */
    public function index(Request $request)
    {
        $query = Material::with(['supplier.user', 'images'])
            ->where('is_available', true)
            ->whereHas('supplier', function($q) {
                $q->where('verification_status', 'verified');
            });

        if ($request->category) {
            $query->where('category', $request->category);
        }

        if ($request->search) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        if ($request->min_price) {
            $query->where('price', '>=', $request->min_price);
        }

        if ($request->max_price) {
            $query->where('price', '<=', $request->max_price);
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->latest()->get()
        ]);
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
            $query->where('name', 'like', '%' . $request->search . '%');
        }

        if ($request->category) {
            $query->where('category', $request->category);
        }

        return response()->json([
            'status' => 'success',
            'data' => $query->latest()->get()
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
            'images.*' => 'image|max:2048',
            'specifications' => 'nullable|array'
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request, $supplier) {
            $data = $request->only(['name', 'description', 'price', 'unit', 'category', 'stock', 'specifications']);
            $data['supplier_id'] = $supplier->id;

            $material = Material::create($data);

            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('materials', 'public');
                    MaterialImage::create([
                        'material_id' => $material->id,
                        'image_path' => $path,
                    ]);
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Material added successfully with multiple images',
                'data' => $material->load('images')
            ]);
        });
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
            'images.*' => 'image|max:2048',
            'deleted_image_ids' => 'nullable|array',
            'deleted_image_ids.*' => 'exists:material_images,id',
        ]);

        if ($validator->fails()) {
            return response()->json(['errors' => $validator->errors()], 422);
        }

        return DB::transaction(function () use ($request, $material) {
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
            if ($request->hasFile('images')) {
                foreach ($request->file('images') as $image) {
                    $path = $image->store('materials', 'public');
                    MaterialImage::create([
                        'material_id' => $material->id,
                        'image_path' => $path,
                    ]);
                }
            }

            return response()->json([
                'status' => 'success',
                'message' => 'Material updated successfully',
                'data' => $material->load('images')
            ]);
        });
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

            return response()->json([
                'status' => 'success',
                'message' => 'Material and its images deleted successfully'
            ]);
        });
    }
}
