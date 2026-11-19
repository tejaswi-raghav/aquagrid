"""Atomic scenario documents: SQLite locally; private Blob ETag CAS on Vercel.

REST headers follow @vercel/blob 2.x (x-if-match, private get cache=0).
Audit/events and applied state commit in the same document write.
"""
from contextlib import closing
import copy
import json
import os
import re
import sqlite3
from pathlib import Path
from urllib.request import Request,urlopen
from urllib.error import HTTPError

class Conflict(Exception): pass
class Missing(Exception): pass

class Repository:
    def __init__(self,path=None):
        self.token=os.environ.get('BLOB_READ_WRITE_TOKEN') if path is None else None
        if os.getenv('VERCEL') and not self.token and path is None:
            raise RuntimeError('Durable storage is not configured; writes disabled.')
        self.path=str(path or os.getenv('AQUAGRID_DB',Path(__file__).parents[2]/'data/operations.sqlite'))
        if not self.token:
            Path(self.path).parent.mkdir(parents=True,exist_ok=True)
            with closing(sqlite3.connect(self.path)) as c:c.execute('CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,body TEXT NOT NULL)');c.commit()
    def _validate(self,key):
        if not re.fullmatch('[a-f0-9]{32}',key):raise Missing('Unknown scenario')
        return 'operations/'+key+'.json'
    def _request(self,url,data=None,headers=None):
        req=Request(url,data=data,headers={'Authorization':'Bearer '+self.token,**(headers or {})},method='PUT' if data is not None else 'GET')
        try:
            with urlopen(req,timeout=20) as r:return json.loads(r.read()),r.headers.get('ETag')
        except HTTPError as e:
            if e.code==404:raise Missing('Unknown scenario') from e
            if e.code in (409,412):raise Conflict('The scenario changed; refresh before acting.') from e
            raise
    def read(self,key):
        name=self._validate(key)
        if self.token:
            store=self.token.split('_')[3]
            return self._request(f'https://{store}.private.blob.vercel-storage.com/{name}?cache=0')[0]
        with closing(sqlite3.connect(self.path)) as c:
            row=c.execute('SELECT body FROM documents WHERE id=?',(key,)).fetchone()
            if not row:raise Missing('Unknown scenario')
            return json.loads(row[0])
    def create(self,doc):
        key=doc['id'];name=self._validate(key)
        if self.token:
            from urllib.parse import urlencode
            self._request('https://vercel.com/api/blob/?'+urlencode({'pathname':name}),json.dumps(doc).encode(),{'x-api-version':'13','x-vercel-blob-access':'private','x-add-random-suffix':'0','x-allow-overwrite':'0','x-content-type':'application/json','x-cache-control-max-age':'0'})
        else:
            with closing(sqlite3.connect(self.path)) as c:c.execute('INSERT INTO documents VALUES(?,?)',(key,json.dumps(doc)));c.commit()
        return doc
    def mutate(self,key,version,fn):
        name=self._validate(key)
        if self.token:
            from urllib.parse import urlencode
            store=self.token.split('_')[3]
            doc,etag=self._request(f'https://{store}.private.blob.vercel-storage.com/{name}?cache=0')
            if doc['version']!=version:raise Conflict('Scenario version is stale; refresh.')
            if not etag:raise Conflict('Storage did not provide a concurrency token; write denied.')
            result=fn(doc)
            doc['version']+=1
            self._request('https://vercel.com/api/blob/?'+urlencode({'pathname':name}),json.dumps(doc).encode(),{'x-api-version':'13','x-vercel-blob-access':'private','x-add-random-suffix':'0','x-allow-overwrite':'1','x-content-type':'application/json','x-cache-control-max-age':'0','x-if-match':etag})
            return doc,result
        c=sqlite3.connect(self.path,timeout=20)
        try:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT body FROM documents WHERE id=?',(key,)).fetchone()
            if not row:raise Missing('Unknown scenario')
            doc=json.loads(row[0])
            if doc['version']!=version:raise Conflict('Scenario version is stale; refresh.')
            result=fn(doc);doc['version']+=1
            c.execute('UPDATE documents SET body=? WHERE id=?',(json.dumps(doc),key));c.commit()
            return doc,result
        except Exception:c.rollback();raise
        finally:c.close()
