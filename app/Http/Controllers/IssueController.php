<?php

namespace App\Http\Controllers;

use App\Services\GoogleService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

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
                if (empty($row[0])) {
                    continue;
                }

                $rowIndex = $index + 2;

                $issues[] = [
                    'id'             => $row[0],
                    'rowIndex'       => $rowIndex,
                    'title'          => $row[1] ?? '',
                    'description'    => $row[2] ?? '',
                    'location'       => $row[3] ?? '',
                    'category'       => $row[4] ?? 'other',
                    'status'         => $row[5] ?? 'open',
                    'reporter'       => $row[6] ?? 'Anonymous',
                    'reportedAt'     => !empty($row[7]) ? strtotime($row[7]) * 1000 : time() * 1000,
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
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to fetch issues: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function store(Request $request)
    {
        try {
            $request->validate([
                'title'       => 'required|string|max:255',
                'description' => 'required|string',
                'location'    => 'required|string|max:255',
                'category'    => 'required|string',
                'reporter'    => 'required|string|max:255',
                'image'       => 'required|file|mimes:jpg,jpeg,png,gif,webp,svg|max:10240',
            ]);
        } catch (ValidationException $ve) {
            $firstError = collect($ve->errors())->flatten()->first();
            return response()->json([
                'success' => false,
                'message' => $firstError ?: 'Invalid form input.',
                'errors'  => $ve->errors(),
            ], 422);
        }

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
                    'id'          => $id,
                    'title'       => $request->title,
                    'description' => $request->description,
                    'location'    => $request->location,
                    'category'    => $request->category,
                    'status'      => 'open',
                    'reporter'    => $request->reporter,
                    'reportedAt'  => strtotime($submittedAt) * 1000,
                    'imageUrl'    => $imageUrl,
                ],
            ]);
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to report issue: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function claim(Request $request, $idOrRowIndex)
    {
        try {
            $request->validate([
                'taker' => 'required|string|max:255',
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'Name required.',
            ], 422);
        }

        try {
            $rows = $this->googleService->getRows();
            $targetRowIndex = null;
            $currentRow = null;

            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                    break;
                }
            }

            if (!$targetRowIndex || !$currentRow) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $currentStatus = $currentRow[5] ?? 'open';

            if ($currentStatus !== 'open') {
                return response()->json([
                    'success' => false,
                    'message' => 'Job already taken or resolved.',
                ], 422);
            }

            $takenAt = Carbon::now()->toIso8601String();

            $this->googleService->updateRow($targetRowIndex, [
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
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to claim job: ' . $e->getMessage(),
            ], 500);
        }
    }

    public function resolve(Request $request, $idOrRowIndex)
    {
        try {
            $request->validate([
                'solver'         => 'required|string|max:255',
                'fixDescription' => 'required|string',
                'proofImage'     => 'nullable|file|mimes:jpg,jpeg,png,gif,webp,svg|max:10240',
            ]);
        } catch (ValidationException $ve) {
            return response()->json([
                'success' => false,
                'message' => collect($ve->errors())->flatten()->first() ?: 'Invalid input.',
            ], 422);
        }

        try {
            $rows = $this->googleService->getRows();
            $targetRowIndex = null;
            $currentRow = null;

            foreach ($rows as $index => $row) {
                $actualRowIndex = $index + 2;
                if (($row[0] ?? '') === (string)$idOrRowIndex || (string)$actualRowIndex === (string)$idOrRowIndex) {
                    $targetRowIndex = $actualRowIndex;
                    $currentRow = $row;
                    break;
                }
            }

            if (!$targetRowIndex || !$currentRow) {
                return response()->json([
                    'success' => false,
                    'message' => 'Issue not found.',
                ], 404);
            }

            $submittedAtRaw = $currentRow[7] ?? null;

            $proofUrl = '';
            if ($request->hasFile('proofImage')) {
                $proofUrl = $this->googleService->uploadImage($request->file('proofImage'), 'proof');
            }

            $solvedAtCarbon = Carbon::now();
            $solvedAt = $solvedAtCarbon->toIso8601String();

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

            $this->googleService->updateRow($targetRowIndex, [
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
        } catch (\Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => 'Failed to resolve issue: ' . $e->getMessage(),
            ], 500);
        }
    }
}

