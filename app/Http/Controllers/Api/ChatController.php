<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\Conversation;
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

        $conversations = Conversation::where('user_one_id', $user->id)
            ->orWhere('user_two_id', $user->id)
            ->with([
                'userOne.arsitek', 'userOne.kontraktor', 'userOne.notaris_profile', 'userOne.interior_profile', 'userOne.courierProfile', 'userOne.supplier',
                'userTwo.arsitek', 'userTwo.kontraktor', 'userTwo.notaris_profile', 'userTwo.interior_profile', 'userTwo.courierProfile', 'userTwo.supplier',
                'latestMessage'
            ])
            ->withCount(['messages as unread_count' => function ($q) use ($user) {
                $q->where('sender_id', '!=', $user->id)
                  ->where('is_read', false);
            }])
            ->orderBy('last_message_at', 'desc')
            ->get();

        // Map conversations to include the "other user" directly
        $formatted = $conversations->map(function ($conv) use ($user) {
            $otherUser = ($conv->user_one_id === $user->id) ? $conv->userTwo : $conv->userOne;

            $redisKey = "user:{$user->id}:conv:{$conv->id}:unread";
            $unreadCount = \Illuminate\Support\Facades\Cache::get($redisKey);

            if ($unreadCount === null) {
                $unreadCount = (int) $conv->unread_count;
                \Illuminate\Support\Facades\Cache::forever($redisKey, $unreadCount);
            } else {
                $unreadCount = (int) $unreadCount;
            }

            return [
                'id' => $conv->id,
                'other_user' => [
                    'id' => $otherUser->id,
                    'name' => $otherUser->name,
                    'username' => $otherUser->username,
                    'role_type' => $otherUser->role_type,
                    'pic' => $otherUser->arsitek->foto ?? 
                             ($otherUser->kontraktor->foto ?? 
                             ($otherUser->notaris_profile->foto ?? 
                             ($otherUser->interior_profile->foto ?? 
                             ($otherUser->courierProfile->foto ?? 
                             ($otherUser->supplier->foto ?? null))))),
                ],
                'last_message' => $conv->latestMessage,
                'unread_count' => $unreadCount,
                'last_message_at' => $conv->last_message_at,
            ];
        });

        return response()->json(['data' => $formatted]);
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
            $conversation = Conversation::create([
                'user_one_id' => min($user1, $user2),
                'user_two_id' => max($user1, $user2),
            ]);
        }

        return response()->json(['data' => $conversation->id]);
    }

    /**
     * Get messages for a specific conversation.
     */
    public function show(Conversation $conversation)
    {
        $user = Auth::user();

        // Ensure user is part of the conversation
        if ($conversation->user_one_id !== $user->id && $conversation->user_two_id !== $user->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        // Mark messages as read
        $conversation->messages()
            ->where('sender_id', '!=', $user->id)
            ->where('is_read', false)
            ->update(['is_read' => true]);

        // Clear the unread count in Cache for this user and conversation
        $redisKey = "user:{$user->id}:conv:{$conversation->id}:unread";
        \Illuminate\Support\Facades\Cache::forget($redisKey);

        $messages = $conversation->messages()
            ->with('sender')
            ->latest()
            ->limit(50)
            ->get()
            ->reverse()
            ->values();

        return response()->json(['data' => $messages]);
    }

    /**
     * Send a message in a conversation.
     */
    public function sendMessage(Request $request, Conversation $conversation)
    {
        $request->validate([
            'content' => 'required_without:image|nullable|string',
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

            // Increment unread count in Cache for the recipient if it is already cached (otherwise it'll lazy-load correctly on next fetch)
            $recipientId = ($conversation->user_one_id === $user->id) ? $conversation->user_two_id : $conversation->user_one_id;
            $recipientRedisKey = "user:{$recipientId}:conv:{$conversation->id}:unread";
            if (\Illuminate\Support\Facades\Cache::has($recipientRedisKey)) {
                \Illuminate\Support\Facades\Cache::increment($recipientRedisKey);
            }

            DB::commit();

            return response()->json(['data' => $message->load('sender')]);
        } catch (\Exception $e) {
            DB::rollBack();

            return response()->json(['message' => 'Failed to send message.'], 500);
        }
    }
}
