import axios from "axios";

export const host =
  // eslint-disable-next-line no-undef
  process.env.NODE_ENV === "development" ? "http://127.0.1.1" : "/";

function http(url, data, method = "GET") {
  return axios({
    url,
    method,
    headers: {
      "content-type": "application/json",
    },
    data,
  }).then((res) => res.data);
}

const api = {
  get: (url, data = []) => http(url, data, "GET"),
  post: (url, data = []) => http(url, data, "POST"),
};

export default api;
