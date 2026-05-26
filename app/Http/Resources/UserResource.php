<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'username' => $this->username,
            'role_type' => $this->role_type,
            'pic' => $this->pic ? asset('storage/' . $this->pic) : null,
            'phone_number' => $this->whenLoaded('phoneNumber'),
            'arsitek' => $this->whenLoaded('arsitek'),
            'kontraktor' => $this->whenLoaded('kontraktor'),
            'notaris_profile' => $this->whenLoaded('notaris_profile'),
            'interior_profile' => $this->whenLoaded('interior_profile'),
            'project_manager' => $this->whenLoaded('project_manager'),
            'structural_engineer' => $this->whenLoaded('structural_engineer'),
            'mep_engineer' => $this->whenLoaded('mep_engineer'),
            'supplier' => $this->whenLoaded('supplier'),
            'team_members' => $this->whenLoaded('teamMembers'),
            'roles' => $this->whenLoaded('roles'),
        ];
    }
}
