<?php
/* ============================================================
   Hostinger Native PHP Email Service — San Isidro College
   Backend Endpoint (api/send-email.php)
   Sends HTML + plain-text reservation notifications (and PDF
   attachments on approval) via Hostinger mail / SMTP.
   ============================================================ */

header('Content-Type: application/json; charset=UTF-8');

// ---- Allowed Origins (CORS support for sicreservations.com & testing) ----
$allowedOrigins = [
    'https://sicreservations.com',
    'https://www.sicreservations.com',
    'https://thebalance2.github.io',
    'http://localhost',
    'http://127.0.0.1'
];

$origin = isset($_SERVER['HTTP_ORIGIN']) ? rtrim($_SERVER['HTTP_ORIGIN'], '/') : '';
$allowOriginHeader = '';
foreach ($allowedOrigins as $allowed) {
    if ($origin === $allowed || strpos($origin, 'http://localhost:') === 0 || strpos($origin, 'http://127.0.0.1:') === 0) {
        $allowOriginHeader = $origin;
        break;
    }
}
if ($allowOriginHeader !== '') {
    header('Access-Control-Allow-Origin: ' . $allowOriginHeader);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// ---- Default Sender Configuration ----
$FROM_EMAIL = 'reservations@sicreservations.com';
$FROM_NAME  = 'San Isidro College Reservations';
$SMTP_HOST  = 'smtp.hostinger.com';
$SMTP_PORT  = 465;
$SMTP_USER  = '';
$SMTP_PASS  = '';

// Optional server-only SMTP credentials file (ignored by Git)
$credentialsFile = __DIR__ . '/smtp-credentials.php';
if (is_file($credentialsFile)) {
    include $credentialsFile;
}

// ---- Parse JSON Payload ----
$rawInput = file_get_contents('php://input');
$data = json_decode($rawInput, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON payload']);
    exit;
}

function cleanHeaderValue($val) {
    return trim(str_replace(["\r", "\n", "\0"], '', (string)$val));
}

$toEmail      = cleanHeaderValue($data['to_email'] ?? '');
$toName       = cleanHeaderValue($data['to_name'] ?? 'Requester');
$status       = cleanHeaderValue($data['status'] ?? 'Notification');
$referenceId  = cleanHeaderValue($data['reference_id'] ?? '—');
$facility     = cleanHeaderValue($data['facility'] ?? '—');
$vehicle      = cleanHeaderValue($data['vehicle'] ?? '—');
$driverName   = cleanHeaderValue($data['driver_name'] ?? '—');
$driverPhone  = cleanHeaderValue($data['driver_phone'] ?? '—');
$date         = cleanHeaderValue($data['date'] ?? '—');
$startTime    = cleanHeaderValue($data['start_time'] ?? '—');
$endTime      = cleanHeaderValue($data['end_time'] ?? '—');
$purpose      = trim((string)($data['purpose'] ?? '—'));
$messageText  = trim((string)($data['message'] ?? ''));
$pdfUrl       = trim((string)($data['pdf_download_url'] ?? ''));
$pdfBase64Raw = trim((string)($data['pdf_base64'] ?? ''));
$pdfFilename  = cleanHeaderValue($data['pdf_filename'] ?? 'SIC-Request-Form.pdf');

if (!filter_var($toEmail, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid recipient email address']);
    exit;
}

// ---- Build Subject ----
if ($status === 'Approved') {
    $subject = "Reservation Update (Approved): {$facility} [{$referenceId}]";
    $badgeBg = '#166534';
    $badgeLabel = 'APPROVED';
} elseif ($status === 'Rejected') {
    $subject = "Reservation Update (Rejected): {$facility} [{$referenceId}]";
    $badgeBg = '#991b1b';
    $badgeLabel = 'REJECTED';
} else {
    $subject = "Reservation Submitted: {$facility} [{$referenceId}]";
    $badgeBg = '#1e40af';
    $badgeLabel = 'BOOKING SUBMITTED';
}

// ---- Extract clean Base64 PDF Attachment if present ----
$pdfBinary = null;
if ($pdfBase64Raw !== '') {
    if (strpos($pdfBase64Raw, 'base64,') !== false) {
        $parts = explode('base64,', $pdfBase64Raw, 2);
        $pdfBase64Raw = $parts[1];
    }
    $decoded = base64_decode($pdfBase64Raw, true);
    if ($decoded !== false && strlen($decoded) > 100 && strlen($decoded) < 3 * 1024 * 1024) {
        $pdfBinary = $decoded;
    }
}

// ---- Build HTML & Plain-Text Bodies ----
$esc = function ($s) {
    return htmlspecialchars((string)$s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
};

$timeRange = ($startTime !== '—' && $endTime !== '—') ? "{$startTime} to {$endTime}" : $startTime;

$vehicleRowsHtml = '';
$vehicleRowsText = '';
if ($vehicle !== '' && $vehicle !== '—' && strtolower($vehicle) !== 'none') {
    $vehicleRowsHtml .= '<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;width:36%;">Vehicle(s)</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">' . $esc($vehicle) . '</td></tr>';
    $vehicleRowsText .= "Vehicle(s): {$vehicle}\n";
    if ($driverName !== '' && $driverName !== '—') {
        $driverDisplay = $driverName . (($driverPhone !== '' && $driverPhone !== '—') ? " ({$driverPhone})" : '');
        $vehicleRowsHtml .= '<tr><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;">Assigned Driver</td><td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">' . $esc($driverDisplay) . '</td></tr>';
        $vehicleRowsText .= "Assigned Driver: {$driverDisplay}\n";
    }
}

$pdfActionHtml = '';
if ($pdfUrl !== '' || $pdfBinary !== null) {
    $attachmentNotice = $pdfBinary !== null
        ? '<p style="margin:10px 0 0;font-size:12px;color:#166534;"><strong>Note:</strong> A copy of your Official Request Form PDF (<code>' . $esc($pdfFilename) . '</code>) is attached directly to this email.</p>'
        : '';
    $buttonHtml = $pdfUrl !== ''
        ? '<a href="' . $esc($pdfUrl) . '" target="_blank" rel="noopener" style="display:inline-block;padding:11px 22px;background-color:#0c165a;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;border-radius:6px;">Open &amp; Download Official Request Form (PDF)</a>
      <p style="margin:10px 0 0;font-size:12px;color:#4b5563;word-break:break-all;">Direct Link: <a href="' . $esc($pdfUrl) . '" style="color:#1d4ed8;">' . $esc($pdfUrl) . '</a></p>'
        : '';
    $pdfActionHtml = '
    <div style="margin:22px 0;padding:18px;background-color:#f0f5ff;border:1px solid #bfdbfe;border-radius:8px;text-align:center;">
      <p style="margin:0 0 12px;font-size:14px;color:#1e3a8a;font-weight:600;">Official Request for the Use of Facilities Form (PDF)</p>
      ' . $buttonHtml . '
      ' . $attachmentNotice . '
    </div>';
}

// Format paragraph message without duplicate raw URL line in HTML if button is rendered
$cleanHtmlMessage = $messageText;
if ($pdfUrl !== '') {
    $cleanHtmlMessage = preg_replace('/\s*Click the link below to open and download your Official Request Form \(PDF\):\s*' . preg_quote($pdfUrl, '/') . '/i', '', $cleanHtmlMessage);
}

$htmlBody = '<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background-color:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
  <div style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
    <div style="background-color:#0c165a;padding:20px 24px;border-bottom:4px solid #d4af37;">
      <div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">San Isidro College</div>
      <div style="font-size:13px;color:#e5e7eb;margin-top:2px;">Digital Facility &amp; Vehicle Reservation System</div>
    </div>
    <div style="padding:24px;">
      <div style="margin-bottom:16px;">
        <span style="display:inline-block;padding:4px 12px;background-color:' . $badgeBg . ';color:#ffffff;font-size:11px;font-weight:700;border-radius:999px;letter-spacing:0.6px;">' . $esc($badgeLabel) . '</span>
      </div>
      <p style="margin:0 0 14px;font-size:15px;">Dear <strong>' . $esc($toName) . '</strong>,</p>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#374151;">' . nl2br($esc($cleanHtmlMessage)) . '</p>
      ' . $pdfActionHtml . '
      <div style="margin-top:18px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
        <div style="background-color:#f9fafb;padding:10px 12px;font-size:13px;font-weight:700;color:#0c165a;border-bottom:1px solid #e5e7eb;">Booking Details</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;width:36%;">Reference ID</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:700;">' . $esc($referenceId) . '</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;">Facility / Location</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">' . $esc($facility) . '</td>
          </tr>
          ' . $vehicleRowsHtml . '
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;">Date</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">' . $esc($date) . '</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#4b5563;font-weight:600;">Time</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;">' . $esc($timeRange) . '</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;color:#4b5563;font-weight:600;">Purpose</td>
            <td style="padding:8px 12px;color:#111827;">' . $esc($purpose) . '</td>
          </tr>
        </table>
      </div>
      <p style="margin:22px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">Best regards,<br><strong>San Isidro College Reservations</strong></p>
    </div>
  </div>
</body>
</html>';

$plainBody = "Dear {$toName},\n\n"
    . "{$messageText}\n\n"
    . "Booking Details:\n"
    . "Reference ID: {$referenceId}\n"
    . "Facility: {$facility}\n"
    . $vehicleRowsText
    . "Date: {$date}\n"
    . "Time: {$timeRange}\n"
    . "Purpose: {$purpose}\n\n"
    . "Best regards,\nSan Isidro College Reservations\n";

// ---- Construct MIME Multipart Message ----
$eol = "\r\n";
$altBoundary   = '=_AltPart_' . md5(uniqid((string)mt_rand(), true));
$mixedBoundary = '=_MixedPart_' . md5(uniqid((string)mt_rand(), true));

$encodedFromName = '=?UTF-8?B?' . base64_encode($FROM_NAME) . '?=';
$encodedSubject  = '=?UTF-8?B?' . base64_encode($subject) . '?=';

$baseHeaders = [
    "From: {$encodedFromName} <{$FROM_EMAIL}>",
    "Reply-To: {$FROM_EMAIL}",
    "MIME-Version: 1.0",
    "X-Mailer: SIC-Reservation-System/1.0"
];

if ($pdfBinary !== null) {
    $baseHeaders[] = "Content-Type: multipart/mixed; boundary=\"{$mixedBoundary}\"";

    $mimeBody  = "--{$mixedBoundary}{$eol}";
    $mimeBody .= "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"{$eol}{$eol}";

    $mimeBody .= "--{$altBoundary}{$eol}";
    $mimeBody .= "Content-Type: text/plain; charset=UTF-8{$eol}";
    $mimeBody .= "Content-Transfer-Encoding: base64{$eol}{$eol}";
    $mimeBody .= chunk_split(base64_encode($plainBody)) . $eol;

    $mimeBody .= "--{$altBoundary}{$eol}";
    $mimeBody .= "Content-Type: text/html; charset=UTF-8{$eol}";
    $mimeBody .= "Content-Transfer-Encoding: base64{$eol}{$eol}";
    $mimeBody .= chunk_split(base64_encode($htmlBody)) . $eol;
    $mimeBody .= "--{$altBoundary}--{$eol}{$eol}";

    $mimeBody .= "--{$mixedBoundary}{$eol}";
    $mimeBody .= "Content-Type: application/pdf; name=\"{$pdfFilename}\"{$eol}";
    $mimeBody .= "Content-Transfer-Encoding: base64{$eol}";
    $mimeBody .= "Content-Disposition: attachment; filename=\"{$pdfFilename}\"{$eol}{$eol}";
    $mimeBody .= chunk_split(base64_encode($pdfBinary)) . $eol;
    $mimeBody .= "--{$mixedBoundary}--{$eol}";
} else {
    $baseHeaders[] = "Content-Type: multipart/alternative; boundary=\"{$altBoundary}\"";

    $mimeBody  = "--{$altBoundary}{$eol}";
    $mimeBody .= "Content-Type: text/plain; charset=UTF-8{$eol}";
    $mimeBody .= "Content-Transfer-Encoding: base64{$eol}{$eol}";
    $mimeBody .= chunk_split(base64_encode($plainBody)) . $eol;

    $mimeBody .= "--{$altBoundary}{$eol}";
    $mimeBody .= "Content-Type: text/html; charset=UTF-8{$eol}";
    $mimeBody .= "Content-Transfer-Encoding: base64{$eol}{$eol}";
    $mimeBody .= chunk_split(base64_encode($htmlBody)) . $eol;
    $mimeBody .= "--{$altBoundary}--{$eol}";
}

// ---- Optional Authenticated SMTP Helper (ssl://smtp.hostinger.com:465) ----
function sendViaSmtp($host, $port, $user, $pass, $fromEmail, $toEmail, $subjectHeader, $headersArr, $body, &$errOut) {
    $fp = @stream_socket_client("ssl://{$host}:{$port}", $errno, $errstr, 15);
    if (!$fp) {
        $errOut = "SMTP connect error: {$errstr} ({$errno})";
        return false;
    }
    stream_set_timeout($fp, 15);
    $read = function () use ($fp) {
        $res = '';
        while ($line = fgets($fp, 515)) {
            $res .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $res;
    };
    $cmd = function ($c) use ($fp, $read) {
        fwrite($fp, $c . "\r\n");
        return $read();
    };

    $greeting = $read();
    if (strpos($greeting, '220') !== 0) { fclose($fp); $errOut = "SMTP greeting: {$greeting}"; return false; }
    $ehlo = $cmd("EHLO sicreservations.com");
    if (strpos($ehlo, '250') !== 0) { fclose($fp); $errOut = "SMTP EHLO: {$ehlo}"; return false; }
    $auth = $cmd("AUTH LOGIN");
    if (strpos($auth, '334') !== 0) { fclose($fp); $errOut = "SMTP AUTH: {$auth}"; return false; }
    $uRes = $cmd(base64_encode($user));
    if (strpos($uRes, '334') !== 0) { fclose($fp); $errOut = "SMTP USER: {$uRes}"; return false; }
    $pRes = $cmd(base64_encode($pass));
    if (strpos($pRes, '235') !== 0) { fclose($fp); $errOut = "SMTP PASS failed"; return false; }

    if (strpos($cmd("MAIL FROM:<{$fromEmail}>"), '250') !== 0) { fclose($fp); $errOut = "SMTP MAIL FROM failed"; return false; }
    if (strpos($cmd("RCPT TO:<{$toEmail}>"), '250') !== 0) { fclose($fp); $errOut = "SMTP RCPT TO failed"; return false; }
    if (strpos($cmd("DATA"), '354') !== 0) { fclose($fp); $errOut = "SMTP DATA failed"; return false; }

    $fullHeaders = array_merge(
        ["To: <{$toEmail}>", "Subject: {$subjectHeader}", "Date: " . date('r'), "Message-ID: <" . uniqid() . "@sicreservations.com>"],
        $headersArr
    );
    $dataPayload = implode("\r\n", $fullHeaders) . "\r\n\r\n" . $body . "\r\n.";
    $sendRes = $cmd($dataPayload);
    $cmd("QUIT");
    fclose($fp);

    if (strpos($sendRes, '250') !== 0) {
        $errOut = "SMTP send rejected: {$sendRes}";
        return false;
    }
    return true;
}

// ---- Dispatch Email ----
$sent = false;
$errorDetail = '';

if ($SMTP_USER !== '' && $SMTP_PASS !== '') {
    $sent = sendViaSmtp($SMTP_HOST, $SMTP_PORT, $SMTP_USER, $SMTP_PASS, $FROM_EMAIL, $toEmail, $encodedSubject, $baseHeaders, $mimeBody, $errorDetail);
}

if (!$sent) {
    $headersStr = implode($eol, $baseHeaders);
    $additionalParams = "-f" . $FROM_EMAIL;
    $sent = @mail($toEmail, $encodedSubject, $mimeBody, $headersStr, $additionalParams);
    if (!$sent) {
        $sent = @mail($toEmail, $encodedSubject, $mimeBody, $headersStr);
    }
}

if ($sent) {
    echo json_encode([
        'ok'       => true,
        'provider' => ($SMTP_USER !== '' && $errorDetail === '') ? 'hostinger-smtp' : 'hostinger-mail',
        'attached' => ($pdfBinary !== null)
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'ok'    => false,
        'error' => $errorDetail ?: 'PHP mail() failed on server. Ensure reservations@sicreservations.com is created in Hostinger Emails.'
    ]);
}
