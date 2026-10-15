<?php
// Приём письма с сайта. Работает на обычном хостинге, без внешних сервисов.

// ─── НАСТРОЙКИ ───────────────────────────────────────────────
$TO   = 'da-scoo@ya.ru';              // куда приходят письма
$FROM = 'site@myfriendaidar.com';     // ящик на вашем домене, от его имени уходит письмо
// ─────────────────────────────────────────────────────────────

header('Content-Type: application/json; charset=utf-8');

function out($ok, $error = null) {
    echo json_encode(['ok' => $ok, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(false, 'method');

// Ловушка для ботов: поле спрятано от людей, бот его заполняет.
if (!empty($_POST['website'])) out(true);

$f = function ($k, $max = 300) {
    $v = isset($_POST[$k]) ? trim((string)$_POST[$k]) : '';
    $v = str_replace(["\r", "\n"], ' ', $v);   // защита от подделки заголовков письма
    return mb_substr($v, 0, $max);
};

$name     = $f('name', 120);
$email    = $f('email', 200);
$telegram = $f('telegram', 120);
$other    = $f('other', 200);
$subject  = $f('subject', 200);
$message  = mb_substr(trim((string)($_POST['message'] ?? '')), 0, 5000);

if ($name === '' || $email === '' || $subject === '' || $message === '') out(false, 'empty');

$body = "Письмо с myfriendaidar.com\n\n"
      . "Имя:       $name\n"
      . "Имейл:     $email\n"
      . "Телеграм:  " . ($telegram !== '' ? $telegram : '—') . "\n"
      . "Контакты:  " . ($other !== '' ? $other : '—') . "\n"
      . "Тема:      $subject\n"
      . "Время:     " . date('d.m.Y H:i') . "\n\n"
      . "Сообщение:\n$message\n";

$subj = '=?UTF-8?B?' . base64_encode("Сайт: $subject") . '?=';

$headers = "MIME-Version: 1.0\r\n"
         . "Content-Type: text/plain; charset=UTF-8\r\n"
         . "Content-Transfer-Encoding: 8bit\r\n"
         . "From: =?UTF-8?B?" . base64_encode('Сайт') . "?= <$FROM>\r\n";

// Чтобы можно было ответить прямо из почты
if (filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $headers .= "Reply-To: $email\r\n";
}

mail($TO, $subj, $body, $headers) ? out(true) : out(false, 'mail');
