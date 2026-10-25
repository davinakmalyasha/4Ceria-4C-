<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UploadPaymentProofRequest;
use App\Http\Requests\VerifyPaymentProofRequest;
use App\Models\Project;
use App\Services\PaymentVerificationService;
use App\Support\SafeError;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class PaymentVerificationController extends Controller
{
    private PaymentVerificationService $service;

    public function __construct(PaymentVerificationService $service)
    {
        $this->service = $service;
    }

    public function uploadProof(UploadPaymentProofRequest $request, Project $project, string $type, int $id)
    {
        try {
            $file = $request->file('proof');
            $model = $this->service->uploadProof($project, $type, $id, $file, auth()->user());
            
            return response()->json([
                'status' => 'success',
                'message' => 'Proof of transfer uploaded successfully.',
                'data' => $model
            ]);
        } catch (\Exception $e) {
            // `SafeError::status()` NEVER returns the raw exception code: for
            // a `QueryException` that is the SQLSTATE STRING 'HY000', and
            // `intval('HY000')` is 0 — so the response status became 0 and
            // the client could not interpret it at all.
            //
            // `SafeError::message()` only echoes a message that was WRITTEN
            // FOR the client; a database failure gets a generic one, and the
            // SQL never leaves the server.
            Log::error('Payment verification failed', ['exception' => $e]);

            return response()->json([
                'status' => 'error',
                'message' => SafeError::message($e),
            ], SafeError::status($e));
        }
    }

    public function verifyProof(VerifyPaymentProofRequest $request, Project $project, string $type, int $id)
    {
        try {
            $model = $this->service->verifyProof(
                $project, 
                $type, 
                $id, 
                auth()->user(),
                $request->input('action'),
                $request->input('notes')
            );
            
            $message = $request->input('action') === 'accept' 
                ? 'Payment verified successfully.' 
                : 'Payment proof rejected. The owner will be notified.';

            return response()->json([
                'status' => 'success',
                'message' => $message,
                'data' => $model
            ]);
        } catch (\Exception $e) {
            // `SafeError::status()` NEVER returns the raw exception code: for
            // a `QueryException` that is the SQLSTATE STRING 'HY000', and
            // `intval('HY000')` is 0 — so the response status became 0 and
            // the client could not interpret it at all.
            //
            // `SafeError::message()` only echoes a message that was WRITTEN
            // FOR the client; a database failure gets a generic one, and the
            // SQL never leaves the server.
            Log::error('Payment verification failed', ['exception' => $e]);

            return response()->json([
                'status' => 'error',
                'message' => SafeError::message($e),
            ], SafeError::status($e));
        }
    }
}
