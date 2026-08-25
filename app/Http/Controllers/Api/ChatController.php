<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\Conversation;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class ChatController extends Controller
{
    /**
     * Get all conversations for the current user.
     */
    public function index()
    {
        $user = Auth::user();

        // PERF: cap the inbox (most recent 100 conversations). Profiles are
        // NOT eager-loaded through 12 relation paths any more — after the
        // page fetch we batch-resolve each participant's avatar with one
        // small indexed query per role actually present.
        $conversations = Conversation::where('user_one_id', $user->id)
            ->orWhere('user_two_id', $user->id)
            ->with(['latestMessage'])
            ->withCount(['messages as unread_count' => function ($q) use ($user) {
                $q->where('sender_id', '!=', $user->id)
                  ->where('is_read', false);
            }])
            ->orderBy('last_message_at', 'desc')
            ->limit(100)
            ->get();

        // Resolve avatars: group "other user" ids by role, one query per role
        $others = $conversations->map(
            fn ($c) => $c->user_one_id === $user->id ? $c->user_two_id : $c->user_one_id
        )->unique()->values();

        $usersById = \App\Models\User::whereIn('id', $others)->get()->keyBy('id');
        $avatarByUserId = $this->resolveAvatars($usersById);

        // Map conversations to include the "other user" directly
        $formatted = $conversations->map(function ($conv) use ($user, $usersById, $avatarByUserId) {
            $otherId = ($conv->user_one_id === $user->id) ? $conv->user_two_id : $conv->user_one_id;
            $otherUser = $usersById->get($otherId);
            if (!$otherUser) {
                return null;
            }

            return [
                'id' => $conv->id,
                'other_user' => [
                    'id' => $otherUser->id,
                    'name' => $otherUser->name,
                    'username' => $otherUser->username,
                    'role_type' => $otherUser->role_type,
                    'pic' => $avatarByUserId[$otherUser->id] ?? null,
                ],
                'last_message' => $conv->latestMessage,
                'unread_count' => (int) $conv->unread_count,
                'last_message_at' => $conv->last_message_at,
            ];
        })->filter()->values();

        return response()->json(['data' => $formatted]);
    }

    /**
     * One query per professional-role table for the given users; returns
     * [user_id => foto] for whoever has an avatar.
     */
    private function resolveAvatars($users): array
    {
        $byRole = $users->groupBy('role_type');
        $avatars = [];

        $map = [
            'arsitek' => [\App\Models\Arsitek::class, 'arsitek'],
            'kontraktor' => [\App\Models\Kontraktor::class, 'kontraktor'],
            'notaris' => [\App\Models\NotarisProfile::class, 'notaris'],
            'interior' => [\App\Models\InteriorProfile::class, 'interior'],
            'project_manager' => [\App\Models\ProjectManager::class, 'project_manager'],
            'courier' => [\App\Models\CourierProfile::class, 'courier'],
            'supplier' => [\App\Models\Supplier::class, 'supplier'],
        ];

        foreach ($map as $role => [$model, $fk]) {
            $ids = $byRole->get($role, collect())->pluck('id');
            if ($ids->isEmpty()) {
                continue;
            }
            $model::whereIn('user_id', $ids)
                ->whereNotNull('foto')
                ->select('user_id', 'foto')
                ->get()
                ->each(fn ($p) => $avatars[$p->user_id] = $p->foto);
        }

        return $avatars;
    }

    /**
     * Start or fetch a conversation with another user.
     */
    public function store(Request $request)
    {
        $request->validate([
            'user_id' => 'required|exists:users,id',
        ]);

        $user1 = Auth::id();
        $user2 = (int) $request->user_id;

        if ($user1 === $user2) {
            return response()->json(['message' => 'Cannot chat with yourself.'], 400);
        }

        // Ensure user_one_id is always the smaller ID for consistency (matches the unique index if we had one, but we used user_one/user_two)
        // Actually, let's just find existing conversation regardless of order
        $conversation = Conversation::where(function ($q) use ($user1, $user2) {
            $q->where('user_one_id', $user1)->where('user_two_id', $user2);
        })->orWhere(function ($q) use ($user1, $user2) {
            $q->where('user_one_id', $user2)->where('user_two_id', $user1);
        })->first();

        if (! $conversation) {
            try {
                $conversation = Conversation::create([
                    'user_one_id' => min($user1, $user2),
                    'user_two_id' => max($user1, $user2),
                ]);
            } catch (\Illuminate\Database\QueryException $e) {
                // RACE GUARD: a unique(user_one_id,user_two_id) collision means
                // another concurrent request created the conversation first —
                // fetch the winner instead of 500ing.
                if (str_contains($e->getMessage(), 'Duplicate entry')) {
                    $conversation = Conversation::where(function ($q) use ($user1, $user2) {
                        $q->where('user_one_id', min($user1, $user2))->where('user_two_id', max($user1, $user2));
                    })->first();
                }
                if (!$conversation) {
                    throw $e;
                }
            }
        }

        return response()->json(['data' => $conversation->id]);
    }

    /**
     * Get messages for a specific conversation.
     *
     * Supports cursor-based history pagination: pass ?before_id={messageId}
     * to load the 50 messages older than the given one ("load earlier").
     */
    public function show(Conversation $conversation, Request $request)
    {
        $user = Auth::user();

        // Ensure user is part of the conversation
        if ($conversation->user_one_id !== $user->id && $conversation->user_two_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $beforeId = $request->query('before_id');

        // Mark messages as read (skip the write entirely when polling an
        // already-caught-up thread — every tick used to run a no-op UPDATE).
        $unreadExists = $conversation->messages()
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->exists();
        if ($unreadExists && !$beforeId) {
            $conversation->messages()
                ->where('sender_id', '!=', $user->id)
                ->where('is_read', false)
                ->update(['is_read' => true]);
        }

        $query = $conversation->messages()
            ->with('sender')
            ->latest();

        if ($beforeId) {
            $query->where('id', '<', (int) $beforeId);
        }

        $messages = $query->limit(50)->get()->reverse()->values();

        // History cursor: true when older messages exist beyond this page.
        $hasMore = $conversation->messages()
            ->when($beforeId, fn ($q) => $q->where('id', '<', (int) $beforeId))
            ->count() > 50;

        return response()->json([
            'data' => $messages,
            'meta' => [
                'oldest_id' => $messages->first()?->id,
                'has_more' => $hasMore,
            ],
        ]);
    }

    /**
     * Send a message in a conversation.
     */
    public function sendMessage(Request $request, Conversation $conversation)
    {
        $request->validate([
            'content' => 'required_without:image|nullable|string|max:4000',
            'image' => 'nullable|image|mimes:jpeg,png,jpg|max:5120', // 5MB max
        ]);

        $user = Auth::user();

        if ($conversation->user_one_id !== $user->id && $conversation->user_two_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        DB::beginTransaction();
        try {
            $imagePath = null;
            if ($request->hasFile('image')) {
                // Store image in public/chat_images
                $imagePath = $request->file('image')->store('chat_images', 'public');
            }

            $message = ChatMessage::create([
                'conversation_id' => $conversation->id,
                'sender_id' => $user->id,
                'content' => $request->input('content', ''),
                'image' => $imagePath,
            ]);

            $conversation->update([
                'last_message_at' => now(),
            ]);

            DB::commit();
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['message' => 'Failed to send message.'], 500);
        }

        // Everything below is non-critical — won't fail the message send
        $recipientId = ($conversation->user_one_id === $user->id) ? $conversation->user_two_id : $conversation->user_one_id;

        // Note: the legacy Redis unread-counter mirror was removed — the inbox
        // now always reads the authoritative DB count (see index()).

        // Non-critical: in-app notification (won't block message send)
        try {
            Notification::create([
                'user_id' => $recipientId,
                'type' => 'chat_message',
                'title' => 'Pesan Baru',
                'body' => $user->name . ': ' . mb_substr($request->input('content', '(gambar)'), 0, 100),
                'data' => [
                    'conversation_id' => $conversation->id,
                    'sender_id' => $user->id,
                    'sender_name' => $user->name,
                ],
            ]);
        } catch (\Exception $e) {
            // Don't block message send on notification failure
        }

        return response()->json(['data' => $message->load('sender')]);
    }
}
