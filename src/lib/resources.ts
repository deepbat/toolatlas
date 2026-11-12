export interface Resource { name: string; url: string; what: string; licence: string }
export interface ResourceGroup { id: string; title: string; intro: string; items: Resource[] }

// Every link was opened and returned a live page when this list was written.
export const RESOURCES: ResourceGroup[] = [
  { id: 'pdf', title: 'PDF and documents', intro: 'For jobs that are too big for a browser tab.', items: [
    { name: 'Stirling-PDF', url: 'https://github.com/Stirling-Tools/Stirling-PDF', what: 'A self-hosted web app with dozens of PDF operations, including OCR and signing.', licence: 'Open source' },
    { name: 'LibreOffice', url: 'https://www.libreoffice.org', what: 'A full office suite for documents, sheets and slides. Opens most Microsoft formats.', licence: 'Open source' },
    { name: 'Paperless-ngx', url: 'https://github.com/paperless-ngx/paperless-ngx', what: 'Scan, index and search your paper documents on your own computer.', licence: 'Open source' },
    { name: 'PDF.js', url: 'https://github.com/mozilla/pdf.js', what: 'The PDF reader library used inside Firefox and inside ToolAtlas.', licence: 'Open source' },
    { name: 'pdf-lib', url: 'https://github.com/Hopding/pdf-lib', what: 'The JavaScript library ToolAtlas uses to create and change PDFs in the browser.', licence: 'Open source' },
  ] },
  { id: 'image', title: 'Images, design and video', intro: 'Desktop editors that do more than a browser can.', items: [
    { name: 'GIMP', url: 'https://www.gimp.org', what: 'A photo editor with layers, masks and filters.', licence: 'Open source' },
    { name: 'Krita', url: 'https://krita.org', what: 'A painting and illustration program with a good brush engine.', licence: 'Open source' },
    { name: 'ImageMagick', url: 'https://imagemagick.org', what: 'Command line tool to convert and resize thousands of images in one go.', licence: 'Open source' },
    { name: 'ExifTool', url: 'https://exiftool.org', what: 'Reads and removes metadata in almost every photo and video format.', licence: 'Open source' },
    { name: 'Excalidraw', url: 'https://github.com/excalidraw/excalidraw', what: 'A whiteboard for quick hand-drawn style diagrams.', licence: 'Open source' },
    { name: 'draw.io desktop', url: 'https://github.com/jgraph/drawio-desktop', what: 'Flowcharts and network diagrams that work offline.', licence: 'Open source' },
    { name: 'Kdenlive', url: 'https://kdenlive.org', what: 'A video editor with a multi-track timeline.', licence: 'Open source' },
    { name: 'HandBrake', url: 'https://handbrake.fr', what: 'Convert video between formats and shrink large files.', licence: 'Open source' },
    { name: 'OBS Studio', url: 'https://obsproject.com', what: 'Record your screen or stream video.', licence: 'Open source' },
    { name: 'Audacity', url: 'https://www.audacityteam.org', what: 'Record and edit audio.', licence: 'Open source' },
    { name: 'VLC', url: 'https://www.videolan.org/vlc/', what: 'Plays nearly any audio or video file.', licence: 'Open source' },
  ] },
  { id: 'money', title: 'Money and business', intro: 'Self-hosted apps for people who keep their own books.', items: [
    { name: 'Actual Budget', url: 'https://github.com/actualbudget/actual', what: 'Envelope budgeting that keeps your data on your own device or server.', licence: 'Open source' },
    { name: 'Firefly III', url: 'https://github.com/firefly-iii/firefly-iii', what: 'Personal finance manager for tracking spending and accounts.', licence: 'Open source' },
    { name: 'Invoice Ninja', url: 'https://github.com/invoiceninja/invoiceninja', what: 'Invoicing and payment tracking for freelancers and small shops. You must set up GST fields yourself.', licence: 'Source available, check the licence before commercial use' },
  ] },
  { id: 'privacy', title: 'Privacy, notes and sync', intro: 'Tools for passwords, notes and files you do not want on someone else\'s server.', items: [
    { name: 'KeePassXC', url: 'https://keepassxc.org', what: 'A password manager that keeps its database as a file you control.', licence: 'Open source' },
    { name: 'Bitwarden clients', url: 'https://github.com/bitwarden/clients', what: 'Source of the Bitwarden apps. The service has a free tier.', licence: 'Open source clients' },
    { name: 'Cryptomator', url: 'https://cryptomator.org', what: 'Encrypts the files you keep in any cloud drive.', licence: 'Open source' },
    { name: 'Joplin', url: 'https://github.com/laurent22/joplin', what: 'Notes with sync to the storage you choose.', licence: 'Open source' },
    { name: 'Syncthing', url: 'https://syncthing.net', what: 'Syncs folders between your own devices with no central server.', licence: 'Open source' },
    { name: 'Immich', url: 'https://github.com/immich-app/immich', what: 'Self-hosted photo and video backup, similar in feel to Google Photos.', licence: 'Open source' },
  ] },
];
