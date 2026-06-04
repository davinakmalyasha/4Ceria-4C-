<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class PortfolioController extends Controller
{
    public function index(Request $request)
    {
        $userId = $request->query('user_id');
        if (!$userId) {
            return response()->json(['message' => 'User ID is required'], 400);
        }

        $portfolios = \App\Models\ProfessionalPortfolio::where('user_id', $userId)->latest()->get();
        return response()->json($portfolios);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'role_type' => 'required|string',
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'duration' => 'nullable|string',
            'client_review' => 'nullable|string',
            'image' => 'nullable|image|max:5120', // 5MB max
        ]);

        $user = \Illuminate\Support\Facades\Auth::user();

        $imagePath = null;
        if ($request->hasFile('image')) {
            $imagePath = $request->file('image')->store('portfolios', 'public');
        }

        $portfolio = \App\Models\ProfessionalPortfolio::create([
            'user_id' => $user->id,
            'role_type' => $validated['role_type'],
            'title' => $validated['title'],
            'description' => $validated['description'],
            'duration' => $validated['duration'] ?? null,
            'client_review' => $validated['client_review'] ?? null,
            'image_path' => $imagePath,
        ]);

        return response()->json([
            'message' => 'Portfolio added successfully',
            'data' => $portfolio
        ]);
    }

    public function destroy($id)
    {
        $portfolio = \App\Models\ProfessionalPortfolio::findOrFail($id);
        
        if ($portfolio->user_id !== \Illuminate\Support\Facades\Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        if ($portfolio->image_path) {
            \Illuminate\Support\Facades\Storage::disk('public')->delete($portfolio->image_path);
        }

        $portfolio->delete();

        return response()->json(['message' => 'Portfolio deleted successfully']);
    }

    public function update(Request $request, $id)
    {
        $portfolio = \App\Models\ProfessionalPortfolio::findOrFail($id);
        
        if ($portfolio->user_id !== \Illuminate\Support\Facades\Auth::id()) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
            'title' => 'required|string|max:255',
            'description' => 'required|string',
            'duration' => 'nullable|string|max:255',
            'client_review' => 'nullable|string|max:1000',
            'image' => 'nullable|image|max:5120', // 5MB max
        ]);

        $imagePath = $portfolio->image_path;
        if ($request->hasFile('image')) {
            if ($portfolio->image_path) {
                \Illuminate\Support\Facades\Storage::disk('public')->delete($portfolio->image_path);
            }
            $imagePath = $request->file('image')->store('portfolios', 'public');
        }

        $portfolio->update([
            'title' => $validated['title'],
            'description' => $validated['description'],
            'duration' => $validated['duration'] ?? null,
            'client_review' => $validated['client_review'] ?? null,
            'image_path' => $imagePath,
        ]);

        return response()->json([
            'message' => 'Portfolio updated successfully',
            'data' => $portfolio
        ]);
    }
}
