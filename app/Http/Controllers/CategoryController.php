<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Services\GoogleService;

class CategoryController extends Controller
{
    private $storagePath = 'campusfix_categories.json';

    public function index()
    {
        $categories = $this->getCategories();
        return response()->json([
            'success' => true,
            'data' => $categories
        ]);
    }

    public function store(Request $request)
    {
        $request->validate([
            'id' => 'required|string',
            'label' => 'required|string'
        ]);

        $categories = $this->getCategories();
        
        // Check if exists
        $exists = false;
        foreach ($categories as $cat) {
            if ($cat['id'] === $request->id) {
                $exists = true;
                break;
            }
        }

        if (!$exists) {
            $categories[] = [
                'id' => $request->id,
                'label' => $request->label
            ];
            $this->saveCategories($categories);
        }

        return response()->json([
            'success' => true,
            'message' => 'Category saved successfully',
            'data' => $categories
        ]);
    }

    public function destroyAndReassign(Request $request, GoogleService $googleService)
    {
        $request->validate([
            'category_id' => 'required|string',
            'replacement_id' => 'nullable|string'
        ]);

        $categoryId = $request->category_id;
        $replacementId = $request->replacement_id;
        $sheetName = $request->sheet; // Optional sheet name

        // 1. Reassign in Google Sheets if a replacement is provided
        if ($replacementId && $sheetName) {
            try {
                $googleService->setSheet($sheetName);
                $rows = $googleService->getRows();
                
                foreach ($rows as $index => $row) {
                    $actualRowIndex = $index + 2;
                    $currentCat = $row[4] ?? null;
                    
                    if ($currentCat === $categoryId) {
                        // Column E is index 4
                        $googleService->updateRow($actualRowIndex, [
                            'E' => $replacementId
                        ]);
                    }
                }
            } catch (\Exception $e) {
                return response()->json([
                    'success' => false,
                    'message' => 'Failed to reassign issues in Google Sheets: ' . $e->getMessage()
                ], 500);
            }
        }

        // 2. Delete the category from local storage
        $categories = $this->getCategories();
        $filtered = array_filter($categories, function($cat) use ($categoryId) {
            return $cat['id'] !== $categoryId;
        });

        // Re-index array
        $filtered = array_values($filtered);
        $this->saveCategories($filtered);

        return response()->json([
            'success' => true,
            'message' => 'Category deleted successfully',
            'data' => $filtered
        ]);
    }

    private function getCategories()
    {
        if (!Storage::exists($this->storagePath)) {
            // Default categories if file doesn't exist
            $defaults = [
                ['id' => 'broken', 'label' => 'Broken Items'],
                ['id' => 'plumbing', 'label' => 'Plumbing'],
                ['id' => 'electrical', 'label' => 'Electrical'],
                ['id' => 'other', 'label' => 'Other']
            ];
            $this->saveCategories($defaults);
            return $defaults;
        }

        $content = Storage::get($this->storagePath);
        return json_decode($content, true) ?: [];
    }

    private function saveCategories($categories)
    {
        Storage::put($this->storagePath, json_encode($categories, JSON_PRETTY_PRINT));
    }
}
