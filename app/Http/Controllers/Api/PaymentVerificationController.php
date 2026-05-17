<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UploadPaymentProofRequest;
use App\Http\Requests\VerifyPaymentProofRequest;
use App\Models\Project;
use App\Services\PaymentVerificationService;
use Illuminate\Http\Request;

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
            $code = $e->getCode();
            if ($code < 100 || $code >= 600) {
                $code = 500;
            }
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage()
            ], $code);
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
            $code = $e->getCode();
            if ($code < 100 || $code >= 600) {
                $code = 500;
            }
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage()
            ], $code);
        }
    }
}
