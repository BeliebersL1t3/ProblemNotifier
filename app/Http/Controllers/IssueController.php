<?php

namespace App\Http\Controllers;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Http\Request;

class IssueController extends Controller
{
    protected GoogleService $googleService;

    public function __construct(GoogleService $googleService)
    {
        $this->googleService = $googleService;
    }

    public function index()
    {
        try {
            $rows = $this->googleService->getRows();
            $issues = [];

            foreach ($rows as $index => $row) {
                // Skip empty rows or rows missing an ID
                if (empty($row[0])) {
                    continue;
                }

                $rowIndex = $index + 2; // Row 1 is header

                $issues[] = [
                    'id'             => $row[0],
                    'rowIndex'       => $rowIndex,
                    'title'          => $row[1] ?? '',
                    'description'    => $row[2] ?? '',
                    'location'       => $row[3] ?? '',
                    'category'       => $row[4] ?? 'other',
                    'status'         => $row[5] ?? 'open',
                    'reporter'       => $row[6] ?? 'Anonymous',
                    'reportedAt'     => $row[7] ? strtotime($row[7]) * 1000 : time() * 1000,
                    'reportedAtIso'  => $row[7] ?? '',
                    'imageUrl'       => $row[8] ?? '',
                    'taker'          => $row[9] ?? null,
                    'takenAt'        => !empty($row[10]) ? strtotime($row[10]) * 1000 : null,
                    'solver'         => $row[11] ?? null,
                    'solvedAt'       => !empty($row[12]) ? strtotime($row[12]) * 1000 : null,
                    'fixDescription' => $row[13] ?? null,
                    'proofImageUrl'  => $row[14] ?? null,
                    'durationLabel'  => $row[15] ?? null,
                ];
            }

            return response()->json([
                'success' => true,
                'data'    => $issues,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch issues: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $request)
    {
        $request->validate([
            'title'       => 'required|string|max:255',
            'description' => 'required|string',
            'location'    => 'required|string|max:255',
            'category'    => 'required|string',
            'reporter'    => 'required|string|max:255',
            'image'       => 'required|image|max:10240', // Max 10MB
        ]);

        try {
            $imageUrl = $this->googleService->uploadImage($request->file('image'), 'problem');
            $id = 'issue-' . time();
            $submittedAt = Carbon::now()->toIso8601String();

            $newRow = [
                $id,
                $request->title,
                $request->description,
                $request->location,
                $request->category,
                'open',
                $request->reporter,
                $submittedAt,
                $imageUrl,
                '', // taker
                '', // takenAt
                '', // solver
                '', // solvedAt
                '', // fixDescription
                '', // proofImageUrl
                '', // durationLabel
            ];

            $this->googleService->appendRow($newRow);

            return response()->json([
                'success' => true,
                'message' => 'Issue reported successfully!',
                'data'    => [
                    'id'            => $id,
                    'title'         => $request->title,
                    'description'   => $request->description,
                    'location'      => $request->location,
                    'category'      => $request->category,
                    'status'        => 'open',
                    'reporter'      => $request->reporter,
                    'reportedAt'    => strtotime($submittedAt) * 1000,
                    'imageUrl'      => $imageUrl,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to report issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function claim(Request $request, int $rowIndex)
    {
        $request->validate([
            'taker' => 'required|string|max:255',
        ]);

        try {
            $rows = $this->googleService->getRows();
            $targetIndex = $rowIndex - 2;

            if (!isset($rows[$targetIndex])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $rows[$targetIndex];
            $currentStatus = $currentRow[5] ?? 'open';

            // Flowchart check: Is status still 'open'?
            if ($currentStatus !== 'open') {
                return response()->json([
                    'success' => false,
                    'message' => 'Job already taken or resolved.',
                ], 422);
            }

            $takenAt = Carbon::now()->toIso8601String();

            $this->googleService->updateRow($rowIndex, [
                'F' => 'progress',
                'J' => $request->taker,
                'K' => $takenAt,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Job claimed successfully!',
                'data'    => [
                    'status'  => 'progress',
                    'taker'   => $request->taker,
                    'takenAt' => strtotime($takenAt) * 1000,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to claim job: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function resolve(Request $request, int $rowIndex)
    {
        $request->validate([
            'solver'         => 'required|string|max:255',
            'fixDescription' => 'required|string',
            'proofImage'     => 'nullable|image|max:10240',
        ]);

        try {
            $rows = $this->googleService->getRows();
            $targetIndex = $rowIndex - 2;

            if (!isset($rows[$targetIndex])) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentRow = $rows[$targetIndex];
            $submittedAtRaw = $currentRow[7] ?? null;

            $proofUrl = '';
            if ($request->hasFile('proofImage')) {
                $proofUrl = $this->googleService->uploadImage($request->file('proofImage'), 'proof');
            }

            $solvedAtCarbon = Carbon::now();
            $solvedAt = $solvedAtCarbon->toIso8601String();

            // Calculate duration using Carbon
            $durationLabel = 'Solved';
            if ($submittedAtRaw) {
                $submittedCarbon = Carbon::parse($submittedAtRaw);
                $diffInMinutes = max(1, $submittedCarbon->diffInMinutes($solvedAtCarbon));

                if ($diffInMinutes < 60) {
                    $durationLabel = "Solved in {$diffInMinutes} minute" . ($diffInMinutes === 1 ? '' : 's');
                } else {
                    $diffInHours = round($diffInMinutes / 60);
                    if ($diffInHours < 48) {
                        $durationLabel = "Solved in {$diffInHours} hour" . ($diffInHours == 1 ? '' : 's');
                    } else {
                        $diffInDays = round($diffInHours / 24);
                        $durationLabel = "Solved in {$diffInDays} day" . ($diffInDays == 1 ? '' : 's');
                    }
                }
            }

            $this->googleService->updateRow($rowIndex, [
                'F' => 'solved',
                'L' => $request->solver,
                'M' => $solvedAt,
                'N' => $request->fixDescription,
                'O' => $proofUrl,
                'P' => $durationLabel,
            ]);

            return response()->json([
                'success' => true,
                'message' => 'Issue resolved successfully!',
                'data'    => [
                    'status'         => 'solved',
                    'solver'         => $request->solver,
                    'solvedAt'       => strtotime($solvedAt) * 1000,
                    'fixDescription' => $request->fixDescription,
                    'proofImageUrl'  => $proofUrl,
                    'durationLabel'  => $durationLabel,
                ],
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to resolve issue: ' . $e->getMessage(),
            ], 500);
        }
    }
}
