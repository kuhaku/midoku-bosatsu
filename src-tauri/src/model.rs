use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedPost {
    pub id: String,
    pub site_id: String,
    pub title: String,
    pub name: String,
    #[serde(default)]
    pub email: String,
    pub posted_at_raw: String,
    /// RFC 3339。日時のパースに失敗した場合は None。
    pub posted_at: Option<String>,
    #[serde(default)]
    pub follow_url: Option<String>,
    #[serde(default)]
    pub thread_url: Option<String>,
    /// 本文末尾の「参考：...」リンクから取得した直接の親投稿ID。
    #[serde(default)]
    pub parent_id: Option<String>,
    /// 「◆」スレッド表示リンクから取得したスレッド先頭投稿ID。
    #[serde(default)]
    pub thread_id: Option<String>,
    pub body_html: String,
    pub body_text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FormField {
    pub name: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ParsedReloadForm {
    pub action: Option<String>,
    pub method: String,
    pub referer: String,
    pub fields: Vec<FormField>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsPostFormOption {
    pub value: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsPostFormControl {
    pub id: String,
    pub name: String,
    pub label: String,
    /// 未読菩薩の投稿UIでユーザーが編集できる意味上の項目。
    /// author / email / subject / body / url のいずれか。その他のFORM項目はNone。
    #[serde(default)]
    pub user_field: Option<String>,
    pub control_type: String,
    pub value: String,
    #[serde(default)]
    pub checked: bool,
    #[serde(default)]
    pub required: bool,
    #[serde(default)]
    pub readonly: bool,
    #[serde(default)]
    pub maxlength: Option<usize>,
    #[serde(default)]
    pub options: Vec<BbsPostFormOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsPostForm {
    pub source_url: String,
    pub action: Option<String>,
    pub method: String,
    pub controls: Vec<BbsPostFormControl>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsPostFormInput {
    pub id: String,
    pub value: String,
    #[serde(default)]
    pub checked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BbsActionViewResult {
    pub site_id: String,
    pub site_name: String,
    pub source_url: String,
    pub posts: Vec<ParsedPost>,
    pub message: String,
    /// 投稿先HTMLから検出したエラーメッセージ。エラーを検出しなければ空文字列。
    #[serde(default)]
    pub error_message: String,
    #[serde(default)]
    pub post_form: Option<BbsPostForm>,
    /// 投稿自体は成功したが返信追跡の保存に失敗した場合の警告。
    #[serde(default)]
    pub tracking_error: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteFetchResult {
    pub site_id: String,
    pub site_name: String,
    /// このレスポンスを得たHTTP method。初回はGET、未読リロードはPOST。
    pub request_method: String,
    /// RFC 3339 / UTC。
    pub fetched_at: String,
    pub posts: Vec<ParsedPost>,
    #[serde(default)]
    pub reply_detected: bool,
    #[serde(default)]
    pub reply_post_ids: Vec<String>,
    #[serde(default)]
    pub reply_notification_error: String,
}
