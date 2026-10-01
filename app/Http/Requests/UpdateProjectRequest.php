<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateProjectRequest extends FormRequest
{
    /**
     * Determine if the user is authorized to make this request.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Get the validation rules that apply to the request.
     *
     * @return array<string, \Illuminate\Contracts\Validation\ValidationRule|array<mixed>|string>
     */
    public function rules(): array
    {
        return [
            'title' => 'sometimes|string|max:255',
            'description' => 'sometimes|string',
            'budget' => 'sometimes|numeric|min:0|max:9999999999999999',
            'lokasi' => 'sometimes|string|max:255',
            'latitude' => 'nullable|string',
            'longitude' => 'nullable|string',
            'province' => 'nullable|string',
            'city' => 'nullable|string',
            'kecamatan' => 'nullable|string',
            'kelurahan' => 'nullable|string',
            'postal_code' => 'nullable|string',
            'street_name' => 'nullable|string',
            'status' => 'sometimes|string|in:open,in_progress,completed,cancelled',
            'target_role' => 'sometimes|string|in:both,arsitek,kontraktor',
            'deadline' => 'sometimes|date',
            // SECURITY: this rule was previously MISSING — POST
            // /projects/{id}/update accepted ANY file of ANY size here.
            'attachment' => 'sometimes|nullable|file|mimes:pdf,doc,docx,xls,xlsx,jpg,jpeg,png,webp,zip|max:10240',
            'images.*' => 'sometimes|file|mimes:jpg,jpeg,png|max:5120',
            'deleted_images' => 'sometimes|array',
            'deleted_images.*' => 'integer',
            'design_details' => 'nullable|array',
            'construction_details' => 'nullable|array',
            'interior_details' => 'nullable|array',
            'completed_phases' => 'nullable|array',
            'wants_project_manager' => 'sometimes',
            'requires_structural' => 'sometimes',
            'requires_mep' => 'sometimes',
            'negotiated_fee' => 'nullable|numeric|min:0',
            'payment_instructions' => 'nullable|string',
            'payment_termins' => 'nullable|array',
            'payment_termins.*.label' => 'required|string',
            'payment_termins.*.percentage' => 'required|numeric|min:0|max:100',
            'payment_termins.*.amount' => 'required|numeric|min:0',
            'payment_termins.*.notes' => 'nullable|string|max:250',
            // Was MISSING entirely, while `ProjectController::update()` writes
            // `$termin['milestone_id']` straight from the payload:
            //
            //     $termin->update(['milestone_id' => $arr['milestone_id'] ?? null]);
            //
            // so a project update could link a payment stage to a milestone on a
            // DIFFERENT project -- and approving that foreign milestone unlocks
            // the stage via ProjectMilestoneController::unlockLinkedTermin().
            //
            // No project id is passed: a FormRequest does not have the bound
            // model, so the rule reads it from the route.
            'payment_termins.*.milestone_id' => [
                'nullable',
                new \App\Rules\MilestoneBelongsToProject,
            ],
            'legal_requirements' => 'nullable|array',
            'legal_requirements.*' => 'string',
            'needed_phases' => 'nullable|string', // JSON array of design,build,interior,legal
        ];
    }
}
