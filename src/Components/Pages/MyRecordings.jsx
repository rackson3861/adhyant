import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "./Navbar";
import Footer from "./Footer";
import { listRecordings, getRecordingBlob, deleteRecording } from "../../utils/recordingDb";
import "/src/assets/css/onlineTest.css";

export default function MyRecordings() {
  const [recordings, setRecordings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [playingId, setPlayingId] = useState(null);
  const [blobUrl, setBlobUrl] = useState(null);
  const [error, setError] = useState(null);

  const load = () => {
    setLoading(true);
    listRecordings()
      .then((list) => {
        setRecordings(list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handlePlay = (id) => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setPlayingId(id);
    getRecordingBlob(id)
      .then((blob) => {
        if (blob) setBlobUrl(URL.createObjectURL(blob));
      })
      .catch(() => setError("Could not load recording."));
  };

  const handleDownload = (id, createdAt) => {
    getRecordingBlob(id).then((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `test-recording-${createdAt.slice(0, 10)}.webm`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  const handleDelete = (id) => {
    if (!window.confirm("Delete this recording?")) return;
    deleteRecording(id).then(load);
  };

  const stopPlayback = () => {
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    setBlobUrl(null);
    setPlayingId(null);
  };

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, []);

  return (
    <>
      <Navbar />
      <div className="online-test-wrapper">
        <div className="container py-5">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <h2 className="mb-0">My Recordings</h2>
            <Link to="/test" className="btn btn-outline-primary">Back to tests</Link>
          </div>
          <p className="text-muted small">
            Recordings are stored only in this browser on this device. You can play or download them here. They are not sent to a server unless you configure an upload URL.
          </p>
          {error && <div className="alert alert-danger">{error}</div>}
          {loading ? (
            <p>Loading…</p>
          ) : recordings.length === 0 ? (
            <div className="card shadow-sm">
              <div className="card-body text-center py-5">
                <p className="text-muted mb-3">No recordings yet.</p>
                <Link to="/test/online" className="btn btn-primary">Take online test</Link>
              </div>
            </div>
          ) : (
            <div className="list-group">
              {recordings.map((r) => (
                <div key={r.id} className="list-group-item list-group-item-action">
                  <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div>
                      <strong>{new Date(r.createdAt).toLocaleString()}</strong>
                      <span className="text-muted ms-2">Score: {r.score}/{r.totalQuestions}</span>
                    </div>
                    <div className="d-flex gap-2">
                      <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => (playingId === r.id && blobUrl ? stopPlayback() : handlePlay(r.id))}>
                        {playingId === r.id && blobUrl ? "Stop" : "Play"}
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => handleDownload(r.id, r.createdAt)}>Download</button>
                      <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => handleDelete(r.id)}>Delete</button>
                    </div>
                  </div>
                  {playingId === r.id && blobUrl && (
                    <div className="mt-3">
                      <video src={blobUrl} controls autoPlay className="rounded w-100" style={{ maxHeight: "320px" }} onEnded={stopPlayback} />
                      <button type="button" className="btn btn-sm btn-link mt-1" onClick={stopPlayback}>Close player</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </>
  );
}
