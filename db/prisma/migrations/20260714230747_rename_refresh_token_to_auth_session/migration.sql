-- RefreshToken → AuthSession 리네이밍 (데이터 보존)
ALTER TABLE `refresh_token` RENAME TO `auth_session`;
ALTER TABLE `auth_session` RENAME INDEX `refresh_token_role_user_id_idx` TO `auth_session_role_user_id_idx`;
