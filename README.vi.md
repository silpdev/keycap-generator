# Xưởng Keycap MX

Công cụ sinh keycap Cherry MX chạy ngay trên trình duyệt. Nhập đúng số đo bạn cặp
được bằng thước cặp, kéo vào một file SVG hoặc PNG, rồi xuất ra `.3mf` hai màu mở
Bambu Studio là in được.

**[▶ Mở công cụ](https://silpdev.github.io/keycap-generator/)** — không cần cài,
không cần đăng ký. Một file HTML duy nhất, lưu về máy mở offline cũng chạy.

![Công cụ: cột thông số, preview 3D, bản vẽ mặt cắt và bảng kiểm tra dung sai](docs/screenshot-light.png)

## Vì sao làm thêm một cái nữa

Phần lớn generator keycap khoá bạn vào đơn vị bàn phím (1u, 1.25u, …) và giấu phần
chân sau một nút ± mơ hồ. Với bàn phím thì ổn, nhưng với một cái clicker giải trí,
vỏ macropad, hay bất cứ hộp nào mà bạn tự đo khoảng cách switch thì vô dụng. Cái này
hỏi thẳng số đo rồi kiểm tra lại:

- **Kích thước tự do.** Đáy, mặt trên, chiều cao, bán kính góc, dày thành, sâu hốc
  switch — nhập trực tiếp theo mm. Cap không vuông cũng được.
- **Chân MX bằng số.** Ngang chữ thập, bề cánh, độ sâu khe, đường kính ống, vát dẫn
  hướng. Chân switch Cherry MX thật đo được **4.10 × 1.30 mm**; khe in ra nên rộng
  hơn **0.10–0.20 mm** để bù co ngót. Bảng kiểm tra báo khe quá chật *trước khi* bạn
  mất một tiếng in.
- **Logo từ ảnh nào cũng được.** SVG hoặc PNG/JPG/WebP, tách thành biên dạng thật,
  giữ nguyên lỗ và các đảo rời. Nổi lên, khắc lõm phẳng mặt, hoặc khoét xuyên.
- **Legend bằng chữ gõ trực tiếp.** `Esc`, `F13`, `⌘` — chọn font, độ đậm, giãn chữ.
  Chữ được rasterise rồi đẩy qua đúng bộ tách hình đã có test cho ảnh, nên không cần
  thư viện đọc outline font, không thêm phụ thuộc nào.
- **Khay hiệu chuẩn khe chân.** Một khay gồm nhiều mẩu thử, khe tăng dần theo bước,
  mỗi mẩu dập sẵn số của chính nó. In một lần, giữ lấy con số.
- **Đế giữ switch.** Đế để ấn switch MX thật vào, có chỗ mà thử mấy mẩu hiệu chuẩn
  và thử cap in xong — kèm tai móc khoá, vì một cái switch trên đế thì kiểu gì cũng
  thành đồ fidget.
- **3MF hai màu.** Thân cap và logo thành hai part riêng có filament riêng, và file
  khai báo sẵn hai slot filament để phần gán màu không bị mất khi import.

## Nó tự kiểm những gì

Bảng kiểm tra dung sai bên phải là phần đáng giá nhất của tool. Nó tính lại theo từng
lần bạn gõ, và mỗi lỗi đều nói rõ phải sửa con số nào:

| Hạng mục | Báo lỗi khi |
|---|---|
| Khe chữ thập | dư so với chân 4.10 mm dưới 0.05 mm hoặc trên 0.40 mm |
| Thành chân | thành ống mỏng hơn 0.50 mm — bằng một đường đùn, dễ nứt |
| Sâu khe | nông hơn 3.4 mm, cap dễ tuột |
| Hốc switch | ở vành hẹp hơn 13.4 mm, cap chặn vào vỏ switch |
| Thành vỏ cap | mỏng hơn 0.80 mm, vỏ in rỗng và bong khỏi mái |
| Hốc ở đỉnh | dưới 9.5 mm, vỏ trên switch chạm vào phần vuốt |
| Mái cap | dưới 1.2 mm, hoặc quá mỏng so với độ sâu khắc |
| Logo vs mặt trên | logo rộng hơn mặt trên |
| Hướng in | in ngửa trong khi không cần thiết (xem dưới) |

## Hiệu chuẩn khe chân, một lần cho xong

Bề rộng khe là con số duy nhất không suy ra được. Nó phụ thuộc nhựa, đầu phun, hiệu
chuẩn lưu lượng, và cách slicer làm tròn một chi tiết 1.3 mm — lệch 0.05 mm là ranh
giới giữa một cap bấm vào kêu tách và một cap nứt chân hoặc tuột ra. Nên đừng đoán:

1. Đặt bề cánh, độ sâu khe, đường kính ống và vát dẫn hướng đúng như bạn sẽ dùng.
2. Xuất khay hiệu chuẩn — mặc định 7 mẩu từ 4.05 đến 4.35 mm.
3. In một màu, **tắt support**, khoảng 20 phút. Nếu không có switch nào đang gắn
   sẵn ở đâu thì in kèm luôn cái đế giữ switch.
4. Thử từng mẩu vào switch thật. Mẩu nào vào chắc tay mà rút ra không phải giằng là
   mẩu thắng.
5. Đọc số dập trên mẩu đó, nhập vào ô **Khe: ngang chữ thập**.

![Bảy mẩu hiệu chuẩn dập số 405 đến 435](docs/calplate.png)

Số dập theo đơn vị phần trăm mm — `425` là khe 4.25 mm — và được khắc trên mặt áp
xuống bàn in, mặt sắc nét nhất máy in làm được. Mỗi mẩu dựng từ đúng `buildCapShell`
và `buildStem` của cap thật, nên khay đo cái gì thì cap ra đúng cái đó; bộ test còn đo
lại bề rộng khe từ mesh đã dựng để chắc mẩu đúng bằng con số dập trên nó.

## Đế giữ switch

Chuẩn plate-mount của Cherry giống nhau ở mọi MX và mọi hàng clone: lỗ vuông
**14 × 14 mm** trên tấm dày **1.5 ±0.1 mm**, hai cái ngàm ở vỏ dưới bung ra bám vào
mặt dưới tấm. Từ mặt trên tấm xuống mặt PCB là 5 mm, nên vỏ dưới thò xuống dưới tấm
khoảng 3.5 mm và chân kim loại của switch plate-mount thêm chừng 3 mm nữa — tất cả
chỗ đó phải trống.

Hai chỗ tool xử lý theo số đó. Lỗ để mặc định **14.15 mm** chứ không phải 14.00: lỗ
in FDM luôn ra nhỏ hơn, đúng 14.00 là switch không vào nổi. Và đế được dựng úp mặt
tấm xuống, nên lỗ nằm ở lớp đầu tiên, hốc mở lên phía đầu phun, và vỏ ngoài **loe ra**
khi lên cao — hướng tự đỡ được. Kết quả: chân đế rộng cho vững, không chỗ nào cần đỡ,
không có support nào phải móc ra khỏi hốc. In xong lật ngược lại là mặt tấm ở trên,
đúng chỗ nhét switch.

![Đế nhìn từ mặt tấm: 21 mm vuông, lỗ 14.15 mm và tai móc khoá](docs/holder.png)

Đầu kia của hốc được **đáy** bịt lại. Bản đầu tôi để hở — hốc khoét thông suốt — nên
đế thành cái ống: nhìn mặt nào cũng thấy switch với mấy cái chân kim loại, mà đeo chìa
khoá thì chân nó vướng vào đủ thứ. Đáy là chỗ **duy nhất** slicer phải bắc cầu, một
nhịp phủ qua hốc gối lên cả bốn thành, và cũng là mặt duy nhất trong cả part không có
gì đỡ (soi overhang trên kết quả boolean: 268 mm² mặt ngang hướng xuống ở chỗ đáy, còn
lại không có gì ở bất kỳ góc nào). **Đừng bật support** — tới lớp đó hốc đã kín, support
chui vào là không bao giờ lấy ra được. Đặt dày đáy = 0 thì quay lại kiểu hở, vẫn đúng
cho đế thử trên bàn khi cần chọc dây vào chân switch; còn đáy kín thì không có cách lấy
switch ra, nên muốn lấy được thì đặt **lỗ đẩy** 5–6 mm để thông que vào đẩy nó ra.

Thành đế để thẳng. Bè chân ra thì đứng vững hơn trên bàn nhưng đeo chìa khoá trông như
cái chặn cửa, mà nó chưa bao giờ là điều kiện để in được — thành thẳng đứng tự đỡ y như
thành loe ra. Muốn bè lại thì có ô `Bè chân đế`.

Tai móc khoá là một cái tai nhô ra ở mức mặt tấm, không phải lỗ khoan xuyên tấm:
giữa lỗ switch và rìa đế chỉ còn 3.4 mm, mà 1.5 mm PLA có lỗ 3 mm ở giữa thì là cái
bản lề chứ không phải tai. Nên tai dày 3 mm — gấp đôi tấm — ăn 2 mm vào thân đế, và
kết thúc bằng nửa vòng tròn quanh lỗ ⌀3.2 mm vừa khoen chìa khoá thường, còn 1.6 mm
nhựa phía sau lỗ và 2.4 mm mỗi bên. Tai nằm trên mặt bàn in ngay từ lớp đầu nên không
tốn thêm thời gian in và cũng không có overhang. Không cần thì bỏ tick, còn lại đúng
cái đế thử.

Phần kiểm tra cũng cùng một ý với cap: nó báo khi lỗ chật quá không nhét được switch
hoặc rộng quá không giữ được, khi tấm ra ngoài khoảng 1.2–1.8 mm mà ngàm cắt cho, khi
hốc dưới tấm cạn hơn phần vỏ dưới cộng chân, và — khi làm nhiều ô — khi hai hốc kề
nhau sắp ăn thông vào nhau. Tai móc khoá có phần kiểm riêng: thiếu nhựa hai bên hoặc
phía sau lỗ, tai mỏng dưới 2 mm, lỗ nhỏ quá không lồng khoen được, hoặc tai ngắn quá
làm lỗ ăn vào thành đế (khi bật bè chân thì thành loe ra theo độ cao, nên nó đo ở đỉnh
tai — chỗ sát nhất). Đáy cũng có phần kiểm riêng: mỏng dưới 0.8 mm thì lớp bắc cầu
không kín, mặt sau in ra rỗ.

## Ba chỗ dễ sai mà nó làm đúng

**Hốc vuốt theo vỏ ngoài.** Vỏ vuốt vào mà hốc dựng thẳng thì thành bị bóp dần theo
độ cao: cap 17.5 mm vuốt xuống 12.5 mm, thành ở vành 1.6 mm nhưng ở đỉnh hốc chỉ còn
**0.34 mm**. Mỏng hơn một đường đùn, slicer in ra rỗng, và vỏ cap tách rời khỏi mái
thành một cái khung riêng. Ở đây hốc được vuốt song song với vỏ ngoài nên thành dày
đều suốt chiều cao — đúng cách cap thương mại được làm.

**Nó tự lật cap khi xuất.** Dựng đứng trên vành hở thì mái hốc switch là một cái cầu
~300 mm² và slicer đòi bật support — mà support sẽ chui vào hốc switch với khe chân,
hỏng độ vừa. Xuất úp mặt trên xuống, cùng cap đó chỉ còn **3.6 mm²** overhang (đo
từng lớp 0.2 mm), mặt trên áp mặt bàn in nên bóng, và logo khắc lõm nằm ở các lớp
đầu — đúng thứ cho ra inlay hai màu sắc nét. Logo nổi thì không lật được nên giữ
in ngửa, và tool nói rõ điều đó.

**Không cần boolean, không cần vá mesh.** Cap, chân và logo được ghi thành các part
riêng trong cùng một object 3MF — part thường thì cộng, `negative_part` thì trừ, và
slicer làm phép boolean. Nhờ vậy không phải nạp kernel CSG bằng WASM, và mỗi part chỉ
cần kín khối riêng nó. Chúng kín thật: bộ test soi từng cạnh của từng part mà không
cho thư viện mesh nào vá trước.

## Kiểm tra

```bash
npm test      # không cần cài gì — core và test chỉ dùng builtin của Node
```

- **`test_tri.mjs`** — tam giác hoá có lỗ. So **tổng diện tích tam giác thu được**
  với diện tích đúng (ngoài trừ lỗ) trên 9 ca: 1, 2, 4, 20 và 30 lỗ, một vành có các
  rãnh mảnh hướng tâm, một lỗ hình sao 60 đỉnh. Lệch phải bằng 0.00% — lệch dương
  nghĩa là có lỗ bị lấp.
- **`test_vec.mjs`** — tách hình từ ảnh. Rasterise một polygon đã biết rồi truy hồi
  lại: diện tích lệch dưới 0.1%, lệch hình học lớn nhất dưới 0.02 mm. Kèm ca donut và
  một đảo rời để phủ phần phân lớp lỗ.
- **`test_export.mjs`** — mọi part sắp ghi vào 3MF, trên **27 tổ hợp** preset × chế
  độ logo × hướng in: mỗi cạnh phải xuất hiện đúng hai lần, không mặt nào trùng đỉnh,
  và thể tích có dấu phải dương. Cố ý không vá mesh — vì slicer âm thầm vá một lỗ
  thủng chính là cách nó lọt tới máy in một lần trong quá trình phát triển.
- **`test_cal.mjs`** — khay hiệu chuẩn. Đo lại bề rộng khe từ mesh của từng mẩu và
  buộc khớp với số dập trên mẩu tới 1e-6 mm, kiểm các thanh chữ số 7 đoạn không được
  dính nhau (dính là hàn thành cạnh không manifold), và soi từng part như
  `test_export.mjs`.
- **`test_holder.mjs`** — đế giữ switch. Đo lại lỗ, dày tấm và độ trống dưới tấm từ
  mesh rồi kiểm switch thật có nhét vô được không, xác nhận vỏ ngoài không bao giờ
  thu vào khi lên cao (loe sai chiều là phải support khắp), đo lỗ móc khoá từ mesh rồi kiểm nhựa
  cả ba phía cùng khoảng cách tới hốc ngàm, xác nhận đáy thật sự bịt kín mặt
  sau (và đặt về 0 thì thật sự hở lại), và đẩy mười ba cấu hình cố ý sai qua phần
  kiểm tra để chắc mỗi lỗi đều bị bắt.
- **`test_mesh.mjs`** — ghi từng part ra `out/*.stl` rồi in kích thước.

## Phát triển

```bash
npm install     # chỉ để chạy dev server
npm run dev     # vite, hot reload

npm run bundle  # build lại docs/index.html (vừa là site vừa là bản offline)
npm test
```

CI chạy test rồi báo lỗi nếu `docs/index.html` không khớp với `src/`.

| File | Việc |
|---|---|
| `src/geom.mjs` | Rounded rect, cross MX, tam giác hoá có lỗ (ear clipping + bridge), lớp `Mesh`, dựng vỏ cap / chân / prism logo |
| `src/vectorize.mjs` | Marching squares trên trường alpha, Douglas–Peucker, phân lớp lỗ theo nesting |
| `src/export3mf.mjs` | Zip writer (STORE + CRC32), 3MF kiểu Bambu, STL nhị phân |
| `src/build.mjs` | Preset, ghép part, hướng in, xếp cap trên khay |
| `src/calibration.mjs` | Chữ số 7 đoạn và khay hiệu chuẩn khe chân |
| `src/holder.mjs` | Đế MX plate-mount, kèm phần kiểm tra độ vừa riêng |
| `src/app.js` | UI: preview WebGL, bản vẽ mặt cắt, bảng kiểm tra dung sai |
| `src/shell.html` | Markup và CSS, dùng chung cho bản dev và bản bundle |
| `bundle.mjs` | Nhồi tất cả vào `docs/index.html` |
| `tools/make-sample-logo.mjs` | Sinh lại hình mẫu đi kèm |

Không vendor thư viện nào: tam giác hoá, tách hình từ ảnh, ghi zip và ghi 3MF đều nằm
trong bốn file trên.

## Hai màu trong Bambu Studio

Part logo mang `<metadata key="extruder" value="2"/>` trong `model_settings.config` —
đúng cách Bambu gán filament cho từng part. Nhưng project chỉ có một filament sẽ ép
part đó về filament 1 và cap ra một màu, nên file xuất còn nhúng một
`project_settings.config` tối giản khai báo hai slot filament theo đúng màu bạn chọn.
File này chỉ chứa các mảng filament, không chứa profile máy in hay print preset, nên
máy bạn đang chọn không bị đổi. Bambu hỏi có nạp cấu hình của project không thì chọn
**có**.

Hai màu vẫn cần project có hai filament. Không có AMS hay slot thứ hai thì không file
nào làm ra được.

Nút `.stl` chỉ để in cap một màu. STL không có khái niệm part trừ, nên logo khắc lõm
hay xuyên sáng đơn giản là không nằm trong file — bạn nhận được một cái cap trơn. Tool
nói rõ điều đó lúc bạn bấm. Khay hiệu chuẩn thì không có STL luôn, cùng lý do: bảy mẩu
giống nhau mà không có số thì tệ hơn là không có khay, vì không biết mẩu nào vừa.

## Ghi công

Ý tưởng đến từ [vostoklabs/SVG-keycap-generator](https://github.com/vostoklabs/SVG-keycap-generator)
— đáng xem nếu bạn cần profile keycap được dựng sẵn và các cỡ chuẩn bàn phím. Hai
project không dùng chung dòng code nào; cái này viết lại từ đầu quanh việc nhập số đo
trực tiếp và kiểm tra dung sai.

Số đo trong các preset được cặp từ những cap lắp vừa switch thật. Hình mẫu đi kèm do
`tools/make-sample-logo.mjs` sinh ra; bạn dùng artwork của mình thì kiểm tra license
của nó trước khi in hoặc chia sẻ.

## Giấy phép

MIT — xem [LICENSE](LICENSE).
