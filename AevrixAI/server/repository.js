const { randomUUID } = require('node:crypto');
const { fail } = require('./errors');
class Repository {
  constructor(db) { this.db = db; }
  async owned(user, id, tx = this.db) {
    const row = (await tx.query('SELECT * FROM conversations WHERE id=$1 AND user_id=$2', [id,user])).rows[0];
    if (!row) fail(404, 'not_found', 'Диалог не найден.');
    return row;
  }
  async list(user, archived = false, query = '') {
    return (await this.db.query(`SELECT * FROM conversations WHERE user_id=$1 AND (archived_at IS NOT NULL)=$2 AND title ILIKE $3 ORDER BY updated_at DESC,id LIMIT 300`, [user,archived,'%'+query+'%'])).rows;
  }
  async create(user, title = 'Новый диалог', mode = 'chat', search = 'auto') {
    return (await this.db.query('INSERT INTO conversations(id,user_id,title,mode,search_mode) VALUES($1,$2,$3,$4,$5) RETURNING *', [randomUUID(),user,title,mode,search])).rows[0];
  }
  async update(user, id, patch) {
    await this.owned(user,id);
    const current = await this.owned(user,id);
    return (await this.db.query('UPDATE conversations SET title=$3,mode=$4,search_mode=$5,archived_at=$6,updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
      [id,user,patch.title ?? current.title,patch.mode ?? current.mode,patch.search_mode ?? current.search_mode,
        patch.archived === undefined ? current.archived_at : patch.archived ? new Date() : null])).rows[0];
  }
  async messages(user,id,{before = 2147483647,limit = 100,all = false} = {}) {
    await this.owned(user,id);
    const rows = (await this.db.query(`SELECT m.*,
      (SELECT count(*)::int FROM messages v WHERE v.parent_message_id=m.parent_message_id AND v.role='bot') AS versions,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'filename',a.filename,'mime_type',a.mime_type,'kind',a.kind)) FROM attachments a WHERE a.message_id=m.id),'[]') AS attachments
      FROM messages m WHERE conversation_id=$1 AND active=true AND m.id<$2 ORDER BY m.id DESC LIMIT $3`, [id,before,all ? 100000 : limit])).rows;
    return rows.reverse();
  }
  async versions(user,id,message) {
    await this.owned(user,id);
    const row = (await this.db.query("SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND role='bot'", [message,id])).rows[0];
    if (!row) fail(404,'not_found','Ответ не найден.');
    return (await this.db.query("SELECT id,content,status,sources,active,created_at FROM messages WHERE conversation_id=$1 AND parent_message_id=$2 AND role='bot' ORDER BY id", [id,row.parent_message_id])).rows;
  }
  async selectVersion(user,id,message) {
    await this.owned(user,id);
    return this.db.transaction(async tx => {
      const row = (await tx.query("SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND role='bot'", [message,id])).rows[0];
      if (!row) fail(404,'not_found','Ответ не найден.');
      const later = (await tx.query("SELECT id FROM messages WHERE conversation_id=$1 AND role='user' AND id>$2 LIMIT 1", [id,row.parent_message_id])).rows.length;
      if (later) fail(409,'branch_required','Изменить версию можно у последнего ответа. Для ранних сообщений создай ветку.');
      await tx.query("UPDATE messages SET active=(id=$3) WHERE conversation_id=$1 AND parent_message_id=$2 AND role='bot'", [id,row.parent_message_id,message]);
      await tx.query('DELETE FROM conversation_summaries WHERE conversation_id=$1 AND covered_end>=$2',[id,row.parent_message_id]);
    });
  }
  async start({user,id,clientKey,fingerprint,text,retryId,image}) {
    return this.db.transaction(async tx => {
      await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user]);
      const conversation = (await tx.query('SELECT * FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE',[id,user])).rows[0];
      if (!conversation) fail(404,'not_found','Диалог не найден.');
      if (conversation.archived_at) fail(409,'archived','Сначала восстанови диалог из архива.');
      const previous = (await tx.query('SELECT * FROM generations WHERE user_id=$1 AND client_key=$2',[user,clientKey])).rows[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) fail(409,'idempotency_conflict','Этот ключ уже использован для другого запроса.');
        const answer = (await tx.query('SELECT * FROM messages WHERE id=$1',[previous.assistant_message_id])).rows[0];
        return { replay: true, generation: previous, answer, conversation };
      }
      let question;
      if (retryId) {
        question = (await tx.query("SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND role='user'",[retryId,id])).rows[0];
        if (!question) fail(404,'not_found','Исходный вопрос не найден.');
        if ((await tx.query("SELECT id FROM messages WHERE conversation_id=$1 AND role='user' AND id>$2 LIMIT 1",[id,retryId])).rows.length) fail(409,'branch_required','Повторить можно последний вопрос; для раннего вопроса создай ветку.');
        await tx.query("UPDATE messages SET active=false WHERE parent_message_id=$1 AND role='bot'",[question.id]);
        await tx.query('DELETE FROM conversation_summaries WHERE conversation_id=$1 AND covered_end>=$2',[id,question.id]);
      } else {
        question = (await tx.query("INSERT INTO messages(user_id,conversation_id,role,content) VALUES($1,$2,'user',$3) RETURNING *",[user,id,text])).rows[0];
        if (image) await this.addAttachment(tx,user,id,question.id,'Изображение',image.mimeType,image.data,'image');
      }
      const answer = (await tx.query("INSERT INTO messages(user_id,conversation_id,role,content,parent_message_id,status) VALUES($1,$2,'bot','',$3,'queued') RETURNING *",[user,id,question.id])).rows[0];
      const generation = (await tx.query('INSERT INTO generations(id,user_id,conversation_id,user_message_id,assistant_message_id,client_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
        [randomUUID(),user,id,question.id,answer.id,clientKey,fingerprint])).rows[0];
      await tx.query("UPDATE conversations SET updated_at=now(),title=CASE WHEN title='Новый диалог' THEN $2 ELSE title END WHERE id=$1",[id,question.content.slice(0,70) || 'Изображение']);
      const storedImage = (await tx.query("SELECT data,mime_type FROM attachments WHERE message_id=$1 AND kind='image' LIMIT 1",[question.id])).rows[0];
      return { generation,answer,question,conversation,image: storedImage ? {data:Buffer.from(storedImage.data),mimeType:storedImage.mime_type} : image };
    });
  }
  async running(generation) {
    await this.db.transaction(async tx => {
      await tx.query("UPDATE generations SET status='running' WHERE id=$1",[generation.id]);
      await tx.query("UPDATE messages SET status='running' WHERE id=$1",[generation.assistant_message_id]);
    });
  }
  async finish(generation,{text,status,sources=[],model=null,usage={},finishReason=null,errorCode=null,image=null}) {
    await this.db.transaction(async tx => {
      await tx.query('UPDATE messages SET content=$2,status=$3,sources=$4 WHERE id=$1',[generation.assistant_message_id,text,status,JSON.stringify(sources)]);
      await tx.query('UPDATE generations SET status=$2,model=$3,usage=$4,finish_reason=$5,error_code=$6,finished_at=now() WHERE id=$1',[generation.id,status,model,JSON.stringify(usage),finishReason,errorCode]);
      if (image) await this.addAttachment(tx,generation.user_id,generation.conversation_id,generation.assistant_message_id,'Сгенерированное изображение',image.mimeType,image.data,'image');
      await tx.query('UPDATE conversations SET updated_at=now() WHERE id=$1',[generation.conversation_id]);
    });
  }
  async context(user,id,before) {
    await this.owned(user,id);
    const summary = (await this.db.query('SELECT * FROM conversation_summaries WHERE conversation_id=$1 AND covered_end<$2',[id,before])).rows[0];
    const rows = (await this.db.query("SELECT id,role,content FROM messages WHERE conversation_id=$1 AND active=true AND status='completed' AND id>$2 AND id<$3 ORDER BY id LIMIT 2000",[id,summary?.covered_end || 0,before])).rows;
    return { summary,rows };
  }
  async summarize(id,end,text) {
    await this.db.query('INSERT INTO conversation_summaries(conversation_id,covered_end,content) VALUES($1,$2,$3) ON CONFLICT(conversation_id) DO UPDATE SET covered_end=$2,content=$3,version=conversation_summaries.version+1,updated_at=now()',[id,end,text]);
  }
  async preferences(user) { return (await this.db.query('SELECT * FROM user_preferences WHERE user_id=$1',[user])).rows[0] || {instructions:'',memory_enabled:false}; }
  async setPreferences(user,value) { await this.db.query('INSERT INTO user_preferences(user_id,instructions,memory_enabled) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET instructions=$2,memory_enabled=$3',[user,value.instructions,value.memory_enabled]); }
  async delete(user,id) { await this.owned(user,id); await this.db.query('DELETE FROM conversations WHERE id=$1 AND user_id=$2',[id,user]); }
  async fork(user,id,questionId,text) {
    await this.owned(user,id);
    return this.db.transaction(async tx => {
      const question = (await tx.query("SELECT * FROM messages WHERE id=$1 AND conversation_id=$2 AND role='user'",[questionId,id])).rows[0];
      if (!question) fail(404,'not_found','Вопрос не найден.');
      const previous = (await tx.query('SELECT * FROM conversations WHERE id=$1',[id])).rows[0];
      const created = (await tx.query('INSERT INTO conversations(id,user_id,title,mode,search_mode) VALUES($1,$2,$3,$4,$5) RETURNING *',[randomUUID(),user,'Ветка · '+text.slice(0,55),previous.mode,previous.search_mode])).rows[0];
      const mapping = new Map();
      for (const m of (await tx.query('SELECT * FROM messages WHERE conversation_id=$1 AND id<$2 AND active=true ORDER BY id',[id,questionId])).rows) {
        const copy = (await tx.query('INSERT INTO messages(user_id,conversation_id,role,content,sources,parent_message_id,status) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',
          [user,created.id,m.role,m.content,JSON.stringify(m.sources),mapping.get(m.parent_message_id) || null,m.status])).rows[0];
        mapping.set(m.id,copy.id);
      }
      // Copy owned assets so deleting the old conversation does not break the branch.
      const assets=new Map();
      for (const a of (await tx.query('SELECT * FROM attachments WHERE conversation_id=$1',[id])).rows) {
        if (a.message_id && !mapping.has(a.message_id)) continue;
        const aid = await this.addAttachment(tx,user,created.id,mapping.get(a.message_id) || null,a.filename,a.mime_type,Buffer.from(a.data),a.kind);
        assets.set(a.id,aid);
        await tx.query('INSERT INTO document_chunks(attachment_id,page,ordinal,content) SELECT $1,page,ordinal,content FROM document_chunks WHERE attachment_id=$2',[aid,a.id]);
      }
      for(const old of(await tx.query('SELECT id,sources FROM messages WHERE conversation_id=$1 AND id<$2 AND active=true',[id,questionId])).rows){
        const copied=(old.sources||[]).map(source=>{const oldAsset=String(source.url||'').replace('/api/attachments/','');return assets.has(oldAsset)?{...source,url:'/api/attachments/'+assets.get(oldAsset)}:source;});
        await tx.query('UPDATE messages SET sources=$2 WHERE id=$1',[mapping.get(old.id),JSON.stringify(copied)]);
      }
      return created;
    });
  }
  async addAttachment(tx,user,id,message,filename,mime,data,kind) {
    await tx.query('SELECT id FROM users WHERE id=$1 FOR UPDATE',[user]);
    const aid = randomUUID();
    const size = (await tx.query('SELECT COALESCE(sum(size),0)::bigint AS size FROM attachments WHERE user_id=$1',[user])).rows[0].size;
    if (Number(size)+data.length > 60*1024*1024) fail(413,'storage_limit','Лимит вложений 60 МБ. Удали ненужные файлы или диалоги.');
    await tx.query('INSERT INTO attachments(id,user_id,conversation_id,message_id,filename,mime_type,size,data,kind) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',[aid,user,id,message,filename,mime,data.length,data,kind]);
    return aid;
  }
  async asset(user,id) { const a=(await this.db.query('SELECT * FROM attachments WHERE id=$1 AND user_id=$2',[id,user])).rows[0]; if(!a) fail(404,'not_found','Файл не найден.'); return a; }
  async documents(user,id) { await this.owned(user,id); return (await this.db.query("SELECT id,filename,mime_type,size,created_at FROM attachments WHERE conversation_id=$1 AND kind='document' ORDER BY created_at",[id])).rows; }
  async addDocument(user,id,file,chunks) {
    await this.owned(user,id);
    return this.db.transaction(async tx => {
      const aid=await this.addAttachment(tx,user,id,null,file.name,file.mime,file.data,'document');
      await tx.query('INSERT INTO document_chunks(attachment_id,page,ordinal,content) SELECT $1,x.page,x.ordinal,x.content FROM jsonb_to_recordset($2::jsonb) AS x(page int,ordinal int,content text)',[aid,JSON.stringify(chunks.map((chunk,ordinal)=>({page:chunk.page,ordinal,content:chunk.text})))]);
      await tx.query('UPDATE conversations SET updated_at=now() WHERE id=$1',[id]);
      return aid;
    });
  }
  async retrieve(user,id,query) {
    await this.owned(user,id);
    const stop=new Set(['что','такое','как','это','про','для','или','при','расскажи','объясни','пожалуйста','мне','могу','what','the','about','and','with','tell']);
    const words=(query.toLowerCase().match(/[\p{L}\d]{3,}/gu)||[]).filter(w=>!stop.has(w)).slice(0,24);
    if(!words.length) return [];
    const tsquery=words.map(w=>w.replace(/[^\p{L}\d]/gu,'')+':*').join(' | ');
    return (await this.db.query(`SELECT c.id,c.page,c.content,a.id AS attachment_id,a.filename,ts_rank(c.search_vector,to_tsquery('simple',$3)) AS rank FROM document_chunks c JOIN attachments a ON a.id=c.attachment_id WHERE a.user_id=$1 AND a.conversation_id=$2 AND c.search_vector @@ to_tsquery('simple',$3) ORDER BY rank DESC,c.id LIMIT 6`,[user,id,tsquery])).rows;
  }
}
module.exports={Repository};
