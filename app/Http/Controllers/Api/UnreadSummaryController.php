<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

class UnreadSummaryController extends Controller
{
    /**
     * Cheap aggregated unread counters for the dashboard header heartbeat.
     * Mirrors ChatController@index unread semantics (DB is the durable truth).
     */
    public function __invoke()
    {
        $user = Auth::user();

        $unreadMessages = DB::table('chat_messages')
            ->join('conversations', 'conversations.id', '=', 'chat_messages.conversation_id')
            ->where(function ($q) use ($user) {
                $q->where('conversations.user_one_id', $user->id)
                  ->orWhere('conversations.user_two_id', $user->id);
            })
            ->where('chat_messages.sender_id', '!=', $user->id)
            ->where('chat_messages.is_read', false)
            ->count();

        $unreadNotifications = Notification::where('user_id', $user->id)
            ->whereNull('read_at')
            ->count();

        return response()->json([
            'unread_messages' => $unreadMessages,
            'unread_notifications' => $unreadNotifications,
        ]);
    }
}
