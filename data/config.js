/* Подключение к облаку Supabase (бесплатно). Пока поля пустые, система работает в локальном режиме:
   аккаунты и лиды хранятся только в этом браузере — удобно для проверки, но не для команды.
   Как заполнить — см. SETUP.md. Anon key публичный: доступ к данным защищают правила в supabase.sql. */
window.LF_CONFIG = {
  supabaseUrl: 'https://adramrvqilbauqouzyxe.supabase.co',
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkcmFtcnZxaWxiYXVxb3V6eXhlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMwMzkzODUsImV4cCI6MjEwODYxNTM4NX0.2Ou7N6sPsEbA7y0SY20eZ-wK7GghVelXYmkgpkGyHzg', // публичный ключ: доступ к данным закрывают правила RLS
  ownerEmail: 'abylakhannurbolat06@icloud.com', // главный аккаунт — единственный администратор
  maxUsers: 10,
};
