<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\House;
use App\Models\HouseQuestion;
use App\Models\HouseAnswer;
use App\Http\Resources\UserResource;
use Illuminate\Http\Request;

class HouseQAController extends Controller
{
    public function index(House $house)
    {
        $questions = $house->questions()
            ->with(['user', 'answers.user'])
            ->latest()
            ->get();

        return response()->json([
            'data' => $questions->map(function ($q) {
                return [
                    'id' => $q->id,
                    'question' => $q->question,
                    'user' => new UserResource($q->user),
                    'created_at' => $q->created_at,
                    'answers' => $q->answers->map(function ($a) {
                        return [
                            'id' => $a->id,
                            'answer' => $a->answer,
                            'user' => new UserResource($a->user),
                            'created_at' => $a->created_at,
                        ];
                    }),
                ];
            }),
        ]);
    }

    public function storeQuestion(Request $request, House $house)
    {
        $request->validate([
            'question' => 'required|string|max:1000',
        ]);

        $question = $house->questions()->create([
            'user_id' => $request->user()->id,
            'question' => $request->question,
        ]);

        $question->load('user');

        return response()->json([
            'data' => [
                'id' => $question->id,
                'question' => $question->question,
                'user' => new UserResource($question->user),
                'created_at' => $question->created_at,
                'answers' => [],
            ],
        ], 201);
    }

    public function storeAnswer(Request $request, HouseQuestion $question)
    {
        // SECURITY: only the listing owner (or an admin) may answer questions
        // on a house — anyone could otherwise impersonate the seller.
        $house = House::find($question->house_id);
        $user = $request->user();
        $isOwner = $house && (int) $house->id_user === (int) $user->id;
        if (! $isOwner && ! $user->hasRole('admin')) {
            return response()->json(['message' => 'Only the property owner can answer questions.'], 403);
        }

        $request->validate([
            'answer' => 'required|string|max:1000',
        ]);

        $answer = $question->answers()->create([
            'user_id' => $request->user()->id,
            'answer' => $request->answer,
        ]);

        $answer->load('user');

        return response()->json([
            'data' => [
                'id' => $answer->id,
                'answer' => $answer->answer,
                'user' => new UserResource($answer->user),
                'created_at' => $answer->created_at,
            ],
        ], 201);
    }


}
