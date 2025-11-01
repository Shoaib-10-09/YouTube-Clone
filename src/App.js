import React, { useEffect, useState } from "react";
import axios from "axios";
import "./App.css";

const CLIENT_ID = "538841587319-bnqf6ll7v64r756hftq8t7b244bqcgdp.apps.googleusercontent.com";
const SCOPE = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.force-ssl"
].join(" ");

const PAGE_SIZE = 12;

function App() {
  const [accessToken, setAccessToken] = useState(null);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [videos, setVideos] = useState([]);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [comments, setComments] = useState([]);
  const [pageTokens, setPageTokens] = useState([null]);
  const [currentPage, setCurrentPage] = useState(0);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [showingLiked, setShowingLiked] = useState(false);
  const [showingWatched, setShowingWatched] = useState(false);
  const [watchedVideos, setWatchedVideos] = useState([]);
  const [totalPages, setTotalPages] = useState(1);

  // Keep login for 1 hour
  useEffect(() => {
    document.body.className = darkMode ? "dark" : "";
    document.documentElement.className = darkMode ? "dark" : "";
    const stored = localStorage.getItem("yt_access_token");
    const expires = localStorage.getItem("yt_token_expires");
    if (stored && expires && Date.now() < Number(expires)) {
      setAccessToken(stored);
      fetchSubscriptions(stored);
    }
  }, []); // run once

  // Helper: get API URL and params
  function getApiConfig(channelId, token) {
    if (showingLiked) {
      const params = {
        part: "snippet,contentDetails",
        myRating: "like",
        maxResults: PAGE_SIZE,
      };
      if (token) params.pageToken = token;
      return {
        url: "https://www.googleapis.com/youtube/v3/videos",
        params,
      };
    } else {
      const params = {
        part: "snippet",
        channelId,
        maxResults: PAGE_SIZE,
        order: "date",
        type: "video",
      };
      if (token) params.pageToken = token;
      return {
        url: "https://www.googleapis.com/youtube/v3/search",
        params,
      };
    }
  }

  const requestAccessToken = () => {
    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (tokenResponse) => {
        localStorage.setItem("yt_access_token", tokenResponse.access_token);
        // Token is valid for ~1 hour (3600s), remember expiration time
        localStorage.setItem(
          "yt_token_expires",
          Date.now() + tokenResponse.expires_in * 1000
        );
        setAccessToken(tokenResponse.access_token);
        fetchSubscriptions(tokenResponse.access_token);
      },
    });
    tokenClient.requestAccessToken();
  };

  const fetchSubscriptions = async (token) => {
    setLoadingSubs(true);
    setSelectedVideo(null);
    setSelectedChannel(null);
    setVideos([]);
    setComments([]);
    setShowingLiked(false);
    setShowingWatched(false);
    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/subscriptions",
        {
          params: { part: "snippet", mine: "true", maxResults: 50 },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSubscriptions(
        response.data.items.map((item) => ({
          id: item.snippet.resourceId.channelId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.default.url,
        }))
      );
    } catch (e) {
      alert("Failed to load subscriptions: " + e.message);
    }
    setLoadingSubs(false);
  };

  const fetchVideosPage = async ({
    channelId = null,
    pageIdx = 0,
    userJump = false,
  }) => {
    setLoadingVideos(true);
    setSelectedVideo(null);
    setComments([]);
    let token = pageTokens[pageIdx] || null;
    const { url, params } = getApiConfig(channelId, token);
    try {
      const response = await axios.get(url, {
        params,
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      let newVideos;
      if (showingLiked) {
        newVideos = response.data.items.map((item) => ({
          id: item.id,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
          publishedAt: item.snippet.publishedAt,
        }));
      } else {
        newVideos = response.data.items.map((item) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails.medium.url,
          publishedAt: item.snippet.publishedAt,
        }));
      }

      setVideos(newVideos);

      let nextTokens = [...pageTokens];
      const thisPageToken = token || null;
      if (!userJump && response.data.nextPageToken) {
        if (pageIdx === pageTokens.length - 1)
          nextTokens = [...nextTokens, response.data.nextPageToken];
      }
      setPageTokens(nextTokens);
      setCurrentPage(pageIdx);
      setTotalPages(
        nextTokens.length > pageIdx + 1 || response.data.nextPageToken
          ? nextTokens.length
          : pageIdx + 1
      );
    } catch (e) {
      setVideos([]);
    }
    setLoadingVideos(false);
  };

  const fetchComments = async (videoId) => {
    try {
      const response = await axios.get(
        "https://www.googleapis.com/youtube/v3/commentThreads",
        {
          params: { part: "snippet,replies", videoId, maxResults: 10 },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      setComments(
        response.data.items.map((item) => ({
          id: item.id,
          author: item.snippet.topLevelComment.snippet.authorDisplayName,
          text: item.snippet.topLevelComment.snippet.textDisplay,
          replies: item.replies ? item.replies.comments : [],
        }))
      );
    } catch (e) {
      setComments([]);
    }
  };

  const toggleDarkMode = () => setDarkMode((prev) => !prev);

  const filteredVideos = searchTerm
    ? videos.filter((v) =>
        v.title.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : videos;

  const onChannelSelect = (channel) => {
    setSelectedChannel(channel);
    setSelectedVideo(null);
    setComments([]);
    setSearchTerm("");
    setPageTokens([null]);
    setCurrentPage(0);
    setShowingLiked(false);
    setShowingWatched(false);
    setTotalPages(1);
    fetchVideosPage({ channelId: channel.id, pageIdx: 0 });
  };

  const onBackToSubs = () => {
    setSelectedChannel(null);
    setSelectedVideo(null);
    setVideos([]);
    setComments([]);
    setPageTokens([null]);
    setCurrentPage(0);
    setShowingLiked(false);
    setShowingWatched(false);
    setTotalPages(1);
  };

  const onVideoSelect = (video) => {
    setSelectedVideo(video);
    fetchComments(video.id);
    // Add to watched history for session
    setWatchedVideos((prev) =>
      prev.some((v) => v.id === video.id) ? prev : [...prev, video]
    );
  };

  const onBackToVideos = () => {
    setSelectedVideo(null);
    setComments([]);
  };

  const onShowLikedVideos = () => {
    setSelectedChannel(null);
    setSelectedVideo(null);
    setComments([]);
    setVideos([]);
    setPageTokens([null]);
    setCurrentPage(0);
    setSearchTerm("");
    setTotalPages(1);
    setShowingLiked(true);
    setShowingWatched(false);
    fetchVideosPage({ channelId: null, pageIdx: 0 });
  };

  const onShowWatchedVideos = () => {
    setSelectedChannel(null);
    setSelectedVideo(null);
    setComments([]);
    setVideos(watchedVideos);
    setPageTokens([null]);
    setCurrentPage(0);
    setSearchTerm("");
    setTotalPages(1);
    setShowingWatched(true);
    setShowingLiked(false);
  };

  const goToNextPage = () => {
    if (showingLiked) {
      fetchVideosPage({
        channelId: null,
        pageIdx: currentPage + 1,
        userJump: false,
      });
    } else if (selectedChannel) {
      fetchVideosPage({
        channelId: selectedChannel.id,
        pageIdx: currentPage + 1,
        userJump: false,
      });
    }
  };

  const goToPrevPage = () => {
    if (currentPage === 0) return;
    if (showingLiked) {
      fetchVideosPage({ channelId: null, pageIdx: currentPage - 1 });
    } else if (selectedChannel) {
      fetchVideosPage({
        channelId: selectedChannel.id,
        pageIdx: currentPage - 1,
      });
    }
  };

  const goToPage = (pageIdx) => {
    if (showingLiked) {
      fetchVideosPage({ channelId: null, pageIdx, userJump: true });
    } else if (selectedChannel) {
      fetchVideosPage({
        channelId: selectedChannel.id,
        pageIdx,
        userJump: true,
      });
    }
  };

  const renderPageNumbers = () =>
    [...Array(pageTokens.length)].map((_, i) => (
      <button
        className="btn-load-more"
        disabled={i === currentPage}
        style={{
          fontWeight: i === currentPage ? "bold" : "normal",
          backgroundColor: i === currentPage ? "#ccc" : undefined,
        }}
        key={i}
        onClick={() => goToPage(i)}
      >
        {i + 1}
      </button>
    ));

  return (
    <div className={darkMode ? "App dark" : "App"}>
      <header className="yt-header">
        <div className="header-left">
          <span role="img" aria-label="tv" className="logo-icon">📺</span>
          <span className="logo-text">MyTube</span>
        </div>
        <div className="header-right">
          <button onClick={toggleDarkMode} className="btn-darkmode">
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
          {accessToken && (
            <>
              <button onClick={onShowLikedVideos} className="btn-liked-videos">
                My Liked Videos
              </button>
              <button onClick={onShowWatchedVideos} className="btn-liked-videos">
                Watched Videos
              </button>
            </>
          )}
        </div>
      </header>

      {!accessToken ? (
        <main className="yt-main signin-screen">
          <h2>Sign In to Your Google Account</h2>
          <button onClick={requestAccessToken} className="btn-auth">
            Authorize YouTube Access
          </button>
        </main>
      ) : selectedVideo ? (
        <main className="yt-main player-view">
          <button className="back-button" onClick={onBackToVideos}>
            ← Back to Videos
          </button>
          <div className="video-player">
            <iframe
              title={selectedVideo.title}
              src={`https://www.youtube.com/embed/${selectedVideo.id}?rel=0&modestbranding=1&autoplay=1`}
              frameBorder="0"
              allow="autoplay; encrypted-media"
              allowFullScreen
              width="100%"
              height="360px"
            ></iframe>
            <h3>{selectedVideo.title}</h3>
            <Comments comments={comments} />
          </div>
        </main>
      ) : (
        <main className="yt-main">
          {showingLiked || showingWatched ? (
            <>
              <button className="back-button" onClick={onBackToSubs}>
                ← Back to Subscriptions
              </button>
              <h2>{showingLiked ? "My Liked Videos" : "Watched Videos"}</h2>
              <input
                type="text"
                placeholder="Search videos..."
                className="video-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {loadingVideos && showingLiked ? (
                <p>Loading liked videos...</p>
              ) : (
                <>
                  {filteredVideos.length === 0 ? (
                    <p>No results found.</p>
                  ) : (
                    <div className="video-grid">
                      {filteredVideos.map((video) => (
                        <div
                          key={video.id}
                          className="video-card"
                          onClick={() => onVideoSelect(video)}
                        >
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="video-thumb"
                          />
                          <p className="video-title">{video.title}</p>
                          <p className="video-date">
                            {new Date(video.publishedAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {!showingWatched && (
                    <div style={{ marginTop: "18px" }}>
                      <button
                        className="btn-load-more"
                        style={{ marginRight: "10px" }}
                        disabled={currentPage === 0}
                        onClick={goToPrevPage}
                      >
                        Previous
                      </button>
                      {renderPageNumbers()}
                      <button
                        className="btn-load-more"
                        disabled={pageTokens.length <= currentPage + 1}
                        onClick={goToNextPage}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : selectedChannel ? (
            <>
              <button className="back-button" onClick={onBackToSubs}>
                ← Back to Subscriptions
              </button>
              <h2>{selectedChannel.title} - Videos</h2>
              <input
                type="text"
                placeholder="Search videos..."
                className="video-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {loadingVideos ? (
                <p>Loading videos...</p>
              ) : (
                <>
                  {filteredVideos.length === 0 ? (
                    <p>No results found.</p>
                  ) : (
                    <div className="video-grid">
                      {filteredVideos.map((video) => (
                        <div
                          key={video.id}
                          className="video-card"
                          onClick={() => onVideoSelect(video)}
                        >
                          <img
                            src={video.thumbnail}
                            alt={video.title}
                            className="video-thumb"
                          />
                          <p className="video-title">{video.title}</p>
                          <p className="video-date">
                            {new Date(video.publishedAt).toLocaleDateString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ marginTop: "18px" }}>
                    <button
                      className="btn-load-more"
                      style={{ marginRight: "10px" }}
                      disabled={currentPage === 0}
                      onClick={goToPrevPage}
                    >
                      Previous
                    </button>
                    {renderPageNumbers()}
                    <button
                      className="btn-load-more"
                      disabled={pageTokens.length <= currentPage + 1}
                      onClick={goToNextPage}
                    >
                      Next
                    </button>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <h2>Your Subscribed Channels</h2>
              {loadingSubs ? (
                <p>Loading subscriptions...</p>
              ) : (
                <ul className="subs-list">
                  {subscriptions.map((channel) => (
                    <li
                      key={channel.id}
                      className="channel-item"
                      onClick={() => onChannelSelect(channel)}
                    >
                      <img
                        src={channel.thumbnail}
                        alt={channel.title}
                        className="channel-thumb"
                      />
                      <span>{channel.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}

const Comments = ({ comments }) => {
  if (!comments || comments.length === 0)
    return <p style={{ marginLeft: 8 }}>No comments to display.</p>;

  return (
    <div className="comments-section">
      <h4>Comments</h4>
      {comments.map(({ id, author, text, replies }) => (
        <div key={id} className="comment">
          <strong>{author}</strong>
          <p dangerouslySetInnerHTML={{ __html: text }}></p>
          {replies && replies.length > 0 && (
            <div className="replies">
              {replies.map((reply) => (
                <div key={reply.id} className="reply">
                  <strong>{reply.snippet.authorDisplayName}:</strong>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: reply.snippet.textDisplay,
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default App;
