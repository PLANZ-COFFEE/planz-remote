import child from "child_process";
import helmet from "helmet";
import cors from "cors";
const express = require("express");
import { ClientGrpcAccessor } from "./grpc.js";
const app = express();
const port = 3000;
const status = {
  kiosk: {
    online: true,
  },
  pii: {
    online: true,
  },
};
const delay = (delayInms) => {
  return new Promise((resolve) => setTimeout(resolve, delayInms));
};

const execSync = child.execSync("cat ~/.profile | grep IP", {
  encoding: "utf-8",
});
const IP = execSync
  .slice(execSync.indexOf("=") + 1)
  .replace(/(\r\n|\n|\r)/gm, "")
  .replace(/"/g, "");

const options = {
  protoPath: "app/pii.proto",
  target: `${IP || "localhost"}:5555`,
  protoLoaderOption: {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  },
};
let cur_ssid = "";
const clientGrpcAccessor = new ClientGrpcAccessor(options);
clientGrpcAccessor.addHandler("data", (message, ssid) => {
  cur_ssid = ssid;
  console.error("data: ", message);
});

clientGrpcAccessor.addHandler("error", (message) => {
  console.error("error: ", message);
});
clientGrpcAccessor.on();

app.use(cors());
app.use(helmet.frameguard());
app.options("*", cors());

// 상태 정보
app.get("/", (req, res) => {
  // updateStatus(status);
  res.sendFile(__dirname + "/index.html");
});

// 터치 재보정
app.get("/status", (req, res) => {
  let kiosk = true;
  let pii = true;

  const kioskProcessNum = child
    .execSync("ps -e | grep -c pkb || true", { encoding: "utf-8" })
    .slice(0, 1);

  // 키오스크가 켜져있는 경우,
  if (kioskProcessNum !== "0") {
    kiosk = true;
  } else {
    kiosk = false;
  }
  //pm2 status | grep PII | grep onffline -c
  const piiProcessNum = child
    .execSync("pm2 status | grep PII | grep online -c || true", {
      encoding: "utf-8",
    })
    .slice(0, 1);
  // 키오스크가 켜져있는 경우,
  if (piiProcessNum !== "0") {
    pii = true;
  } else {
    pii = false;
  }

  res.send({ kiosk, pii });
});

// 터치 재보정
app.get("/touch", (req, res) => {
  res.send("success");
  child.execSync("bash ~/scripts/touchScreenCali.sh", {
    encoding: "utf-8",
  });
});

// 재부팅
app.get("/reboot", (req, res) => {
  res.send("success");
  child.execSync("reboot", {
    encoding: "utf-8",
  });
});

app.get("/pcb-reset", (req, res) => {
  res.send("success");
  const data = {
    ssid: cur_ssid,
    key: "jobRequest",
    sender: "remote-server",
    instructions: [
      {
        type: "RESET",
        version: "0.0.1",
        requiredModules: [{ name: "pcb" }],
        requiredIngredients: [],
        data: "",
      },
    ],
  };
  const stringifyMessage = JSON.stringify(data);
  clientGrpcAccessor.write(cur_ssid, stringifyMessage);
});

// 제빙기 리셋
app.get("/im-reset", (req, res) => {
  res.send("success");
  const data = {
    ssid: cur_ssid,
    key: "jobRequest",
    sender: "remote-server",
    instructions: [
      {
        type: "IM_RESET",
        version: "0.0.1",
        requiredModules: [{ name: "iceMaker" }],
        requiredIngredients: [],
        data: "",
      },
    ],
  };
  const stringifyMessage = JSON.stringify(data);
  clientGrpcAccessor.write(cur_ssid, stringifyMessage);
});

app.get("/kiosk-shutdown", (req, res) => {
  try {
    const a = child
      .execSync("ps -e | grep -c pkb || true", { encoding: "utf-8" })
      .slice(0, 1);
    if (a !== "0") {
      child.exec("killall -9 pkb || true", {
        encoding: "utf-8",
      });
    }
  } catch (err) {
    console.log(err.message);
    return;
  }
});

// pii, kiosk 재부팅
app.get("/restart", async (req, res) => {
  res.send("success");
  // kiosk 종
  // const chd = child.spawn('bash ~/scripts/restart.sh');

  console.log("before");
  try {
    const a = child
      .execSync("ps -e | grep -c pkb || true", { encoding: "utf-8" })
      .slice(0, 1);
    if (a !== "0") {
      child.exec("killall -9 pkb || true", {
        encoding: "utf-8",
      });
    }
  } catch (err) {
    console.log(err.message);
    return;
  }

  // pii restart

  await delay(1000);

  // kiosk 재실행,
  child.exec("bash ~/scripts/kiosk-auto.sh", {
    encoding: "utf-8",
  });
  try {
    child.exec("pm2 restart PII || [[ $? == 1 ]]", {
      encoding: "utf-8",
    });
  } catch (e) {
    console.log(e.message);
    return;
  }
});

app.listen(port, IP || "localhost", () => {
  console.log(IP);
  console.log("서버가 실행됩니다.");
});
