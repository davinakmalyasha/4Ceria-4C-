<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProjectMilestoneResource extends JsonResource
{
    /**
     * Transform the resource into an array.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        // Disable cache-backed appends on professional relationships during serialization
        // to prevent massive network latency in development and redundant queries in production.
        if ($this->arsitek) {
            $this->arsitek->setAppends([]);
        }
        if ($this->kontraktor) {
            $this->kontraktor->setAppends([]);
        }
        if ($this->notaris) {
            $this->notaris->setAppends([]);
        }
        if ($this->interior) {
            $this->interior->setAppends([]);
        }
        if ($this->pm) {
            $this->pm->setAppends([]);
        }

        $array = parent::toArray($request);
        if (isset($array['content']) && is_array($array['content']) && isset($array['content']['gallery'])) {
            $array['content']['gallery'] = $this->gallery_urls;
        }
        return $array;
    }
}
