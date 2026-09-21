<?php

namespace App\Services;

class IssueSheetRepository
{
    // Sheet Column Index Constants (0-indexed)
    public const COL_ID                   = 0;
    public const COL_TITLE                = 1;
    public const COL_DESCRIPTION          = 2;
    public const COL_LOCATION             = 3;
    public const COL_CATEGORY             = 4;
    public const COL_STATUS               = 5;
    public const COL_REPORTER             = 6;
    public const COL_CREATED_DATE         = 7;
    public const COL_IMAGE_URL            = 8;
    public const COL_TAKER                = 9;
    public const COL_TAKEN_DATE           = 10;
    public const COL_SOLVED_BY            = 11;
    public const COL_SOLVED_DATE          = 12;
    public const COL_ACTION_TAKEN         = 13;
    public const COL_PROOF_IMAGE          = 14;
    public const COL_DURATION             = 15;
    public const COL_PRIORITY             = 16;
    public const COL_DEADLINE             = 17;
    public const COL_PENDING_REASON       = 18;
    public const COL_PENDING_BY           = 19;
    public const COL_PENDING_IMAGE        = 20;
    public const COL_TAGGED_DEPTS         = 21;
    public const COL_ORIGIN_DEPT          = 22;
    public const COL_ASSIGNED_DEPTS       = 23;
    public const COL_EDIT_LOGS            = 24;
    public const COL_ARCHIVE_STATUS       = 25;
    public const TOTAL_COLUMNS            = 26;

    /**
     * Determine if a sheet row represents an archived issue.
     */
    public static function isArchived(array $row): bool
    {
        $status = trim($row[self::COL_ARCHIVE_STATUS] ?? '');
        return $status === '0';
    }

    /**
     * Get the Issue ID from a row.
     */
    public static function getId(array $row): string
    {
        return trim($row[self::COL_ID] ?? '');
    }

    /**
     * Ensure row array has all 26 columns padded.
     */
    public static function padRow(array $row): array
    {
        return array_pad($row, self::TOTAL_COLUMNS, '');
    }

    /**
     * Extract tagged or assigned departments list from row.
     */
    public static function getAssignedDepartments(array $row): array
    {
        $raw = !empty($row[self::COL_ASSIGNED_DEPTS])
            ? $row[self::COL_ASSIGNED_DEPTS]
            : (!empty($row[self::COL_TAGGED_DEPTS]) ? $row[self::COL_TAGGED_DEPTS] : '');

        if (empty($raw)) {
            return [];
        }

        return array_values(array_filter(array_map('trim', explode(',', $raw))));
    }

    /**
     * Normalize department key for consistent comparison.
     */
    public static function normalizeDeptKey(?string $dept): string
    {
        if (empty($dept)) {
            return '';
        }
        $normalized = strtolower(trim($dept));
        $normalized = str_replace(['&', '/', '\\', '-', '_', 'department', 'dept'], ' ', $normalized);
        return preg_replace('/\s+/', ' ', $normalized);
    }
}
